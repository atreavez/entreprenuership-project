import type {Database} from '../../../database';
import type {PoolClient} from 'pg';
import type {AuditService} from '../../../audit';
import type {UserAuth} from '../../../common';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {requireBillingActivation} from './billing-activation';
import {adjustmentSchemaReleased,adjustmentOrganizationLock} from './adjustment-activation';
import {hydrateInvoice} from './pg-billing.repository';
import {reconcilePayment,renewPaidSubscription,validateCatalog,type PaymentObservation} from '../domain/commercial-policy';
import {matchingObservation,validateReconciliationRequest,type ReconciliationRequest,type ReconciliationGate,type SettlementRepository,type SettlementResult} from '../application/reconciliation.service';
/** Separate trusted worker database connection and operator-assigned audit
 * identity. Never construct from an HTTP principal. No Nest registration,
 * credentials, grants or scheduler are enabled by this implementation.
 */
export class PgSettlementRepository implements SettlementRepository{
 constructor(private readonly workerDb:Database,private readonly audit:AuditService,
  private readonly gate:ReconciliationGate,private readonly identityFor:(org:string)=>UserAuth|null,
  private readonly expectedRole:string,private readonly fence:(tx:PoolClient,r:ReconciliationRequest)=>Promise<boolean>=async()=>false){
  if(!/^assettrust_billing_worker_[a-z0-9_]{1,32}$/.test(expectedRole))throw Error('Dedicated settlement role required');
 }
 async settle(r:ReconciliationRequest,o:PaymentObservation):Promise<SettlementResult>{
  validateReconciliationRequest(r);
  if(!matchingObservation(r,o)||o.state!=='SETTLED'||!this.gate.authorized(r))return 'REVIEW_REQUIRED';
  const actor=this.identityFor(r.organizationId);
  if(!actor||actor.organizationId!==r.organizationId)throw Error('Missing authorized settlement audit identity');
  return this.workerDb.transaction(async tx=>{
   await requireBillingActivation(tx);
   await setTenantScope(tx,r.organizationId);
   const role=(await tx.query(`SELECT current_user AS name,session_user AS login,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,
    has_column_privilege(current_user,'public.billing_invoices','payment_key','UPDATE') AS can_settle,
    has_table_privilege(current_user,'public.billing_settlements','INSERT') AS can_record,
    EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=pg_roles.oid) AS inherited_membership,
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY['billing_invoices','billing_catalog_versions','billing_settlements','billing_journal','billing_subscriptions','billing_reconciliation_jobs','billing_reconciliation_history','audit_events','assettrust_schema_migrations'])
        AND (c.relowner=pg_roles.oid OR has_table_privilege(current_user,c.oid,'TRUNCATE')
         OR has_table_privilege(current_user,c.oid,'TRIGGER') OR has_any_column_privilege(current_user,c.oid,'REFERENCES')
         OR has_table_privilege(current_user,c.oid,'DELETE'))) AS unsafe_financial_ddl,
    EXISTS(SELECT 1 FROM unnest(ARRAY['billing_catalog_versions','billing_settlements','billing_journal','billing_subscriptions','billing_reconciliation_history','audit_events','assettrust_schema_migrations']) t(name)
      WHERE has_any_column_privilege(current_user,'public.'||t.name,'UPDATE')) AS immutable_update,
    EXISTS(SELECT 1 FROM unnest(ARRAY['id','organization_id','catalog_version','lines','total_ugx','currency','created_at']) c(name)
      WHERE has_column_privilege(current_user,'public.billing_invoices',c.name,'UPDATE')) AS price_update,
    (has_any_column_privilege(current_user,'public.billing_catalog_versions','INSERT')
      OR has_any_column_privilege(current_user,'public.billing_invoices','INSERT')
      OR has_any_column_privilege(current_user,'public.assettrust_schema_migrations','INSERT')) AS forbidden_insert
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
   if(role?.name!==this.expectedRole||role.login!==role.name||['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','inherited_membership','schema_create','database_create','unsafe_financial_ddl','immutable_update','price_update','forbidden_insert'].some(k=>role[k]!==false)||role.can_settle!==true||role.can_record!==true)throw Error('Restricted dedicated settlement login required');
   const member=await tx.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE",[actor.id,r.organizationId]);
   if(member.rows.length!==1)throw Error('Settlement audit identity is no longer active');
   if(!this.gate.authorized(r)||!await this.fence(tx,r))return 'REVIEW_REQUIRED';
   const locked=await tx.query('SELECT * FROM public.billing_invoices WHERE organization_id=$1 AND id=$2 FOR UPDATE',[r.organizationId,r.invoiceId]);
   if(locked.rows.length!==1)return 'NOT_FOUND';
   const invoice=await hydrateInvoice(tx,locked.rows[0]);
   if(invoice.organizationId!==r.organizationId||invoice.id!==r.invoiceId||invoice.totalUgx!==o.amountUgx||!['ISSUED','PAID'].includes(invoice.state))return 'REVIEW_REQUIRED';
   if(invoice.state==='PAID'&&invoice.paymentKey!==JSON.stringify([r.providerId,r.transactionId]))return 'REVIEW_REQUIRED';
   const transition=reconcilePayment(invoice,invoice.revision,r.providerId,o);
   if(invoice.state==='PAID'){
    const stored=await tx.query('SELECT provider_id,transaction_id,amount_ugx,currency FROM public.billing_settlements WHERE organization_id=$1 AND invoice_id=$2',[r.organizationId,r.invoiceId]);
    const j=await tx.query("SELECT amount_ugx FROM public.billing_journal WHERE organization_id=$1 AND invoice_id=$2 AND revision=2 AND event='PAID' AND debit_account='PAYMENT_CLEARING' AND credit_account='RECEIVABLE'",[r.organizationId,r.invoiceId]);
    const s=stored.rows[0];
    if(stored.rows.length!==1||s.provider_id!==r.providerId||s.transaction_id!==r.transactionId||Number(s.amount_ugx)!==invoice.totalUgx||s.currency!=='UGX'||j.rows.length!==1||Number(j.rows[0].amount_ugx)!==invoice.totalUgx)throw Error('Incomplete recorded settlement');
    return 'ALREADY_SETTLED';
   }
   const issue=await tx.query("SELECT amount_ugx FROM public.billing_journal WHERE organization_id=$1 AND invoice_id=$2 AND revision=1 AND event='ISSUED' AND debit_account='RECEIVABLE' AND credit_account='DEFERRED_SERVICE_REVENUE'",[r.organizationId,r.invoiceId]);
   if(issue.rows.length!==1||Number(issue.rows[0].amount_ugx)!==invoice.totalUgx)throw Error('Missing issuance journal');
   if(!this.gate.authorized(r)||!await this.fence(tx,r))return 'REVIEW_REQUIRED';
   // Global unique provider+transaction identity, also unique funding invoice.
   // A conflict reveals no information about the other tenant.
   const recorded=await tx.query(`INSERT INTO public.billing_settlements(organization_id,invoice_id,provider_id,transaction_id,amount_ugx,currency)
    VALUES($1,$2,$3,$4,$5,'UGX') ON CONFLICT DO NOTHING RETURNING invoice_id`,[r.organizationId,r.invoiceId,r.providerId,r.transactionId,invoice.totalUgx]);
   if(recorded.rowCount!==1)return 'REVIEW_REQUIRED';
   const updated=await tx.query(`UPDATE public.billing_invoices SET state='PAID',revision=$4,payment_key=$5
    WHERE organization_id=$1 AND id=$2 AND revision=$3 AND state='ISSUED' AND payment_key IS NULL RETURNING id`,[r.organizationId,r.invoiceId,invoice.revision,transition.invoice.revision,transition.invoice.paymentKey]);
   if(updated.rowCount!==1)throw Error('Settlement revision changed');
   await tx.query(`INSERT INTO public.billing_journal(organization_id,invoice_id,revision,event,debit_account,credit_account,amount_ugx)
    VALUES($1,$2,$3,'PAID','PAYMENT_CLEARING','RECEIVABLE',$4)`,[r.organizationId,r.invoiceId,transition.invoice.revision,invoice.totalUgx]);
   const priceRow=(await tx.query('SELECT version,prices FROM public.billing_catalog_versions WHERE version=$1',[invoice.catalogVersion])).rows[0];
   if(!priceRow)throw Error('Historical pricing unavailable');
   const catalog=validateCatalog({version:Number(priceRow.version),prices:priceRow.prices});
   const recurring=invoice.lines.filter(l=>catalog.prices.some(p=>p.code===l.code&&p.periodDays!==null));
   let subscriptionState='NOT_APPLICABLE';
   if(recurring.length){
    // A single recurring service, quantity one, funds one term. Mixed or
    // multi-quantity recurring invoices require an explicit future allocation.
    subscriptionState='REVIEW_REQUIRED';
    if(invoice.lines.length===1&&recurring.length===1&&recurring[0].quantity===1){
     const adjustments=await adjustmentSchemaReleased(tx);
     if(adjustments)await tx.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))',[adjustmentOrganizationLock(r.organizationId)]);
     const code=recurring[0].code;
     // Serialize same-tenant, same-service renewal across different invoices.
     await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify(['assettrust:billing:renewal',r.organizationId,code])]);
     const time=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows[0];
     const history=await tx.query(`SELECT t.organization_id,t.funding_invoice_id,t.code,t.catalog_version,t.starts_at,t.ends_at
      FROM public.billing_subscriptions t JOIN public.billing_invoices i ON i.organization_id=t.organization_id AND i.id=t.funding_invoice_id
      JOIN public.billing_settlements s ON s.organization_id=i.organization_id AND s.invoice_id=i.id
      WHERE t.organization_id=$1 AND t.code=$2 AND i.state='PAID' AND s.amount_ugx=i.total_ugx AND s.currency=i.currency
      AND i.payment_key=replace(jsonb_build_array(s.provider_id,s.transaction_id)::text, ', ', ',')
      ${adjustments?'AND NOT EXISTS(SELECT 1 FROM public.billing_adjustments a WHERE a.organization_id=t.organization_id AND a.invoice_id=t.funding_invoice_id)':''}`,[r.organizationId,code]);
     const terms=history.rows.map(t=>({organizationId:t.organization_id,fundingInvoiceId:t.funding_invoice_id,code:t.code,catalogVersion:Number(t.catalog_version),startsAt:Number(t.starts_at),endsAt:Number(t.ends_at)}));
     const term=renewPaidSubscription(transition.invoice,catalog,code,Number(time?.now_ms),terms);
     const sub=await tx.query(`INSERT INTO public.billing_subscriptions(organization_id,funding_invoice_id,code,catalog_version,starts_at,ends_at)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING funding_invoice_id`,[term.organizationId,term.fundingInvoiceId,term.code,term.catalogVersion,term.startsAt,term.endsAt]);
     if(sub.rowCount!==1)throw Error('Subscription activation failed');
     subscriptionState='RECORDED';
    }
   }
   await this.audit.write(tx,actor,'BILLING_PAYMENT_SETTLED','invoice',invoice.id,{providerId:r.providerId,transactionId:r.transactionId,totalUgx:invoice.totalUgx,revision:transition.invoice.revision,subscriptionState});
   return 'SETTLED';
  });
 }
}
