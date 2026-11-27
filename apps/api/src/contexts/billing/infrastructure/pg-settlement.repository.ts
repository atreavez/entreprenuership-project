import type {Database} from '../../../database';
import type {AuditService} from '../../../audit';
import type {UserAuth} from '../../../common';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {requireBillingActivation} from './billing-activation';
import {hydrateInvoice} from './pg-billing.repository';
import {reconcilePayment,paidSubscription,validateCatalog,type PaymentObservation} from '../domain/commercial-policy';
import {matchingObservation,validateReconciliationRequest,type ReconciliationRequest,type ReconciliationGate,type SettlementRepository,type SettlementResult} from '../application/reconciliation.service';
/** Separate trusted worker database connection and operator-assigned audit
 * identity. Never construct from an HTTP principal. No Nest registration,
 * credentials, grants or scheduler are enabled by this implementation.
 */
export class PgSettlementRepository implements SettlementRepository{
 constructor(private readonly workerDb:Database,private readonly audit:AuditService,
  private readonly gate:ReconciliationGate,private readonly identityFor:(org:string)=>UserAuth|null,
  private readonly expectedRole:string){
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
    has_table_privilege(current_user,'public.billing_settlements','INSERT') AS can_record
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
   if(role?.name!==this.expectedRole||role.login!==role.name||['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'].some(k=>role[k]!==false)||role.can_settle!==true||role.can_record!==true)throw Error('Restricted dedicated settlement login required');
   const member=await tx.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE",[actor.id,r.organizationId]);
   if(member.rows.length!==1)throw Error('Settlement audit identity is no longer active');
   if(!this.gate.authorized(r))return 'REVIEW_REQUIRED';
   const locked=await tx.query('SELECT * FROM public.billing_invoices WHERE organization_id=$1 AND id=$2 FOR UPDATE',[r.organizationId,r.invoiceId]);
   if(locked.rows.length!==1)return 'NOT_FOUND';
   const invoice=await hydrateInvoice(tx,locked.rows[0]);
   if(invoice.organizationId!==r.organizationId||invoice.id!==r.invoiceId||invoice.totalUgx!==o.amountUgx||!['ISSUED','PAID'].includes(invoice.state))return 'REVIEW_REQUIRED';
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
   if(!this.gate.authorized(r))return 'REVIEW_REQUIRED';
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
     const time=(await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms')).rows[0];
     const term=paidSubscription(transition.invoice,catalog,recurring[0].code,Number(time?.now_ms));
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
