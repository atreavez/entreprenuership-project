/** Refund/chargeback accounting foundation. Observations record completed
 * reversals only; no provider execution or revenue recognition is implied. */
export type Funding=Readonly<{organizationId:string;invoiceId:string;providerId:string;transactionId:string;currency:'UGX';amountUgx:number}>;
export type AdjustmentKind='REFUND'|'CHARGEBACK';
export type AdjustmentLocator=Readonly<{organizationId:string;invoiceId:string;providerId:string;transactionId:string;adjustmentId:string;kind:AdjustmentKind}>;
export type AdjustmentObservation=AdjustmentLocator&Readonly<{currency:string;amountUgx:number;state:'PENDING'|'CONFIRMED'|'FAILED'}>;
export type RefundApproval=Readonly<{id:string;organizationId:string;invoiceId:string;providerId:string;transactionId:string;adjustmentId:string;amountUgx:number;submittedBy:string;approvedBy:string;reason:string}>;
export type Adjustment=AdjustmentLocator&Readonly<{currency:'UGX';amountUgx:number;approvalId:string|null;debitAccount:'FINANCIAL_ADJUSTMENT_SUSPENSE';creditAccount:'PAYMENT_CLEARING'}>;
export type AdjustmentDecision=Readonly<{state:'RECORDED'|'ALREADY_RECORDED';record:Adjustment;remainingUgx:number;entitlement:'REVIEW_REQUIRED'|'REVERSED'}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);
const money=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=1000000000;
function sameFunding(f:Funding,a:AdjustmentLocator):boolean{
 return a.organizationId===f.organizationId&&a.invoiceId===f.invoiceId&&a.providerId===f.providerId&&a.transactionId===f.transactionId;
}
export function validateLocator(a:AdjustmentLocator):void{
 if(!a||!uuid(a.organizationId)||!uuid(a.invoiceId)||!id(a.providerId)||!id(a.transactionId)||!id(a.adjustmentId)||!['REFUND','CHARGEBACK'].includes(a.kind))throw Error('Invalid adjustment locator');
}
function validateApproval(a:RefundApproval|null,f:Funding,o:AdjustmentObservation):string{
 if(!a||!uuid(a.id)||!uuid(a.submittedBy)||!uuid(a.approvedBy)||a.submittedBy===a.approvedBy||
  a.organizationId!==f.organizationId||a.invoiceId!==f.invoiceId||a.providerId!==f.providerId||a.transactionId!==f.transactionId||a.adjustmentId!==o.adjustmentId||
  a.amountUgx!==o.amountUgx||typeof a.reason!=='string'||a.reason.trim().length<12||a.reason.length>500)throw Error('Independent exact refund approval required');
 return a.id;
}
export function decideAdjustment(f:Funding,o:AdjustmentObservation,history:readonly Adjustment[],approval:RefundApproval|null):AdjustmentDecision{
 validateLocator(o);
 if(!f||!sameFunding(f,o)||f.currency!=='UGX'||!money(f.amountUgx)||o.currency!==f.currency||o.state!=='CONFIRMED'||!money(o.amountUgx))throw Error('Confirmed matching reversal required');
 let reversed=0;const ids=new Set<string>(),approvals=new Set<string>();let existing:Adjustment|undefined;
 for(const h of history){
  validateLocator(h);
  if(!sameFunding(f,h)||h.currency!==f.currency||!money(h.amountUgx)||ids.has(h.adjustmentId)||h.debitAccount!=='FINANCIAL_ADJUSTMENT_SUSPENSE'||h.creditAccount!=='PAYMENT_CLEARING'||
   (h.kind==='REFUND'?(!uuid(h.approvalId)||approvals.has(h.approvalId)):h.approvalId!==null))throw Error('Invalid adjustment history');
  ids.add(h.adjustmentId);if(h.approvalId)approvals.add(h.approvalId);
  reversed+=h.amountUgx;if(reversed>f.amountUgx)throw Error('Reversal history exceeds payment');
  if(h.adjustmentId===o.adjustmentId)existing=h;
 }
 // An already-recorded exact replay is read-only even if approval is no
 // longer supplied; changed amounts/kinds with the same ID are never accepted.
 if(existing){
  if(existing.kind!==o.kind||existing.amountUgx!==o.amountUgx)throw Error('Conflicting adjustment replay');
  return Object.freeze({state:'ALREADY_RECORDED',record:existing,remainingUgx:f.amountUgx-reversed,entitlement:reversed===f.amountUgx?'REVERSED':'REVIEW_REQUIRED'});
 }
 if(reversed+o.amountUgx>f.amountUgx)throw Error('Adjustment exceeds remaining payment');
 const approvalId=o.kind==='REFUND'?validateApproval(approval,f,o):null;
 if(approvalId&&approvals.has(approvalId))throw Error('Refund approval already consumed');
 if(o.kind==='CHARGEBACK'&&approval!==null)throw Error('Chargeback is an external event, not a voluntary refund');
 const record=Object.freeze({organizationId:f.organizationId,invoiceId:f.invoiceId,providerId:f.providerId,transactionId:f.transactionId,adjustmentId:o.adjustmentId,kind:o.kind,currency:'UGX' as const,amountUgx:o.amountUgx,approvalId,debitAccount:'FINANCIAL_ADJUSTMENT_SUSPENSE' as const,creditAccount:'PAYMENT_CLEARING' as const});
 const remainingUgx=f.amountUgx-reversed-o.amountUgx;
 return Object.freeze({state:'RECORDED',record,remainingUgx,entitlement:remainingUgx===0?'REVERSED':'REVIEW_REQUIRED'});
}
/** Optional paid features only. Original term and payment remain historical.
 * Any partial reversal requires review; do not invent prorated durations. */
export function adjustedEntitlement(original:'ACTIVE'|'GRACE'|'DENIED',confirmedAdjustments:number):'ACTIVE'|'GRACE'|'DENIED'{
 return Number.isSafeInteger(confirmedAdjustments)&&confirmedAdjustments===0?original:'DENIED';
}
