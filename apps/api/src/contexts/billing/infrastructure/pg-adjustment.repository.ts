import type {Database} from '../../../database';
import type {AuditService} from '../../../audit';
import type {UserAuth} from '../../../common';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {requireAdjustmentSchema,adjustmentOrganizationLock,adjustmentInvoiceLock} from './adjustment-activation';
import {decideAdjustment,validateLocator,type Adjustment,type AdjustmentLocator,type AdjustmentObservation,type RefundApproval} from '../domain/financial-adjustment';
import type {AdjustmentRepository} from '../application/adjustment.service';
/** Deliberately disconnected. No ordinary API principal may construct this
 * repository; a separately provisioned trusted adjustment worker is required. */
export class PgAdjustmentRepository implements AdjustmentRepository{
 constructor(private readonly db:Database,private readonly audit:AuditService,
  private readonly identityFor:(org:string)=>UserAuth|null,private readonly role:string,
  private readonly authorized:(locator:AdjustmentLocator)=>boolean=()=>false){
  if(!/^assettrust_adjustment_worker_[a-z0-9_]{1,28}$/.test(role))throw Error('Dedicated adjustment login required');
 }
 async record(r:AdjustmentLocator,o:AdjustmentObservation):Promise<'RECORDED'|'ALREADY_RECORDED'|'REVIEW_REQUIRED'>{
  validateLocator(r);
  if(!this.authorized(r)||!o||r.organizationId!==o.organizationId||r.invoiceId!==o.invoiceId||r.providerId!==o.providerId||r.transactionId!==o.transactionId||r.adjustmentId!==o.adjustmentId||r.kind!==o.kind||o.state!=='CONFIRMED')return 'REVIEW_REQUIRED';
  const actor=this.identityFor(r.organizationId);
  if(!actor||actor.organizationId!==r.organizationId)throw Error('Missing adjustment audit identity');
  return this.db.transaction(async tx=>{
   // Both reviewed inventory and actual ledger must match. Manually creating
   // a table cannot enable this adapter.
   await requireAdjustmentSchema(tx);
   await setTenantScope(tx,r.organizationId);
   const flags=(await tx.query(`SELECT current_user AS name,session_user AS login,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,
    EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=pg_roles.oid) AS membership,
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY(ARRAY['billing_invoices','billing_settlements','billing_journal','billing_subscriptions','billing_catalog_versions','billing_refund_requests','billing_refund_decisions','billing_refund_approvals','billing_adjustments','audit_events','assettrust_schema_migrations'])
     AND (c.relowner=pg_roles.oid OR has_table_privilege(current_user,c.oid,'DELETE') OR has_any_column_privilege(current_user,c.oid,'UPDATE')
      OR has_table_privilege(current_user,c.oid,'TRUNCATE') OR has_table_privilege(current_user,c.oid,'TRIGGER') OR has_any_column_privilege(current_user,c.oid,'REFERENCES'))) AS unsafe_write,
    EXISTS(SELECT 1 FROM unnest(ARRAY['billing_invoices','billing_settlements','billing_journal','billing_subscriptions','billing_catalog_versions','billing_refund_requests','billing_refund_decisions','billing_refund_approvals','assettrust_schema_migrations']) t(name)
     WHERE has_any_column_privilege(current_user,'public.'||t.name,'INSERT')) AS forbidden_insert,
    has_table_privilege(current_user,'public.billing_adjustments','INSERT') AS can_record
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
   if(flags?.name!==this.role||flags.login!==flags.name||flags.can_record!==true||
    ['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','membership','schema_create','database_create','unsafe_write','forbidden_insert'].some(k=>flags[k]!==false))throw Error('Unsafe adjustment worker grants');
   // Serialize every adjustment on the same paid invoice. The original paid
   // invoice remains immutable; no UPDATE privilege on it is required.
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[adjustmentOrganizationLock(r.organizationId)]);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[adjustmentInvoiceLock(r.organizationId,r.invoiceId)]);
   const member=await tx.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL",[actor.id,r.organizationId]);
   if(member.rows.length!==1||!this.authorized(r))throw Error('Adjustment authority unavailable');
   const result=await tx.query(`SELECT s.organization_id,s.invoice_id,s.provider_id,s.transaction_id,s.amount_ugx,s.currency
    FROM public.billing_settlements s JOIN public.billing_invoices i ON i.organization_id=s.organization_id AND i.id=s.invoice_id
    WHERE s.organization_id=$1 AND s.invoice_id=$2 AND s.provider_id=$3 AND s.transaction_id=$4
    AND i.state='PAID' AND i.revision=2 AND i.total_ugx=s.amount_ugx AND i.currency=s.currency AND i.payment_key=$5
    AND EXISTS(SELECT 1 FROM public.billing_journal j WHERE j.organization_id=i.organization_id AND j.invoice_id=i.id
     AND j.event='ISSUED' AND j.revision=1 AND j.amount_ugx=i.total_ugx)
    AND EXISTS(SELECT 1 FROM public.billing_journal j WHERE j.organization_id=i.organization_id AND j.invoice_id=i.id
     AND j.event='PAID' AND j.revision=2 AND j.amount_ugx=i.total_ugx)`,[r.organizationId,r.invoiceId,r.providerId,r.transactionId,JSON.stringify([r.providerId,r.transactionId])]);
   if(result.rows.length!==1)return 'REVIEW_REQUIRED';
   const f=result.rows[0];
   const history=await tx.query('SELECT * FROM public.billing_adjustments WHERE organization_id=$1 AND invoice_id=$2',[r.organizationId,r.invoiceId]);
   const records:Adjustment[]=history.rows.map(h=>({organizationId:h.organization_id,invoiceId:h.invoice_id,providerId:h.provider_id,transactionId:h.transaction_id,adjustmentId:h.adjustment_id,kind:h.kind,currency:h.currency,amountUgx:Number(h.amount_ugx),approvalId:h.approval_id,debitAccount:h.debit_account,creditAccount:h.credit_account}));
   let approval:RefundApproval|null=null;
   if(r.kind==='REFUND'){
    const approved=await tx.query('SELECT * FROM public.billing_refund_approvals WHERE organization_id=$1 AND invoice_id=$2 AND provider_id=$3 AND transaction_id=$4 AND adjustment_id=$5',[r.organizationId,r.invoiceId,r.providerId,r.transactionId,r.adjustmentId]);
    if(approved.rows.length===1){const a=approved.rows[0];approval={id:a.id,organizationId:a.organization_id,invoiceId:a.invoice_id,providerId:a.provider_id,transactionId:a.transaction_id,adjustmentId:a.adjustment_id,amountUgx:Number(a.amount_ugx),submittedBy:a.submitted_by,approvedBy:a.approved_by,reason:a.reason};}
   }
   let decision;
   try{decision=decideAdjustment({organizationId:f.organization_id,invoiceId:f.invoice_id,providerId:f.provider_id,transactionId:f.transaction_id,currency:f.currency,amountUgx:Number(f.amount_ugx)},o,records,approval);}
   catch{return 'REVIEW_REQUIRED';}
   if(decision.state==='ALREADY_RECORDED')return 'ALREADY_RECORDED';
   if(!this.authorized(r))return 'REVIEW_REQUIRED';
   const a=decision.record;
   const insert=await tx.query(`INSERT INTO public.billing_adjustments(organization_id,invoice_id,provider_id,transaction_id,adjustment_id,kind,currency,amount_ugx,approval_id,debit_account,credit_account)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING adjustment_id`,
    [a.organizationId,a.invoiceId,a.providerId,a.transactionId,a.adjustmentId,a.kind,a.currency,a.amountUgx,a.approvalId,a.debitAccount,a.creditAccount]);
   if(insert.rowCount!==1)return 'REVIEW_REQUIRED';
   await this.audit.write(tx,actor,'BILLING_ADJUSTMENT_RECORDED','invoice',a.invoiceId,{kind:a.kind,providerId:a.providerId,adjustmentId:a.adjustmentId,amountUgx:a.amountUgx,remainingUgx:decision.remainingUgx,entitlement:decision.entitlement,approvalId:a.approvalId});
   return 'RECORDED';
  });
 }
}
