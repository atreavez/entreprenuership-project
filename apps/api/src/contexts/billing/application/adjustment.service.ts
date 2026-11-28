import {validateLocator,type AdjustmentLocator,type AdjustmentObservation} from '../domain/financial-adjustment';
/** Observation only, never initiate a refund. Adapters authenticate responses,
 * normalize stable provider adjustment identities and distinguish final reversals
 * from disputed/pending events. No production adapter is registered. */
export interface AdjustmentPort{
 readonly providerId:string;
 observeAdjustment(locator:AdjustmentLocator,signal:AbortSignal):Promise<AdjustmentObservation|null>;
}
export type AdjustmentResult='NOT_CONNECTED'|'PENDING'|'RETRY_REQUIRED'|'REVIEW_REQUIRED'|'RECORDED'|'ALREADY_RECORDED';
export interface AdjustmentRepository{
 // Within a single tenant transaction: lock original paid invoice, validate
 // settlement and historical ledger, resolve exact independently approved refund
 // from server-owned records, derive the decision, enforce global uniqueness,
 // append the reversal and audit atomically. No client-supplied approval.
 record(locator:AdjustmentLocator,observation:AdjustmentObservation):Promise<'RECORDED'|'ALREADY_RECORDED'|'REVIEW_REQUIRED'>;
}
export class AdjustmentService{
 private readonly adapters=new Map<string,AdjustmentPort>();
 constructor(adapters:readonly AdjustmentPort[],private readonly repository:AdjustmentRepository,
  private readonly allowed:(locator:AdjustmentLocator)=>boolean=()=>false,private readonly timeoutMs=15000){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid adjustment deadline');
  for(const a of adapters){if(!a||typeof a.providerId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(a.providerId)||typeof a.observeAdjustment!=='function'||this.adapters.has(a.providerId))throw Error('Invalid adjustment adapter');this.adapters.set(a.providerId,a);}
 }
 async verify(input:AdjustmentLocator):Promise<AdjustmentResult>{
  validateLocator(input);
  const r=Object.freeze({organizationId:input.organizationId,invoiceId:input.invoiceId,providerId:input.providerId,transactionId:input.transactionId,adjustmentId:input.adjustmentId,kind:input.kind});
  const adapter=this.adapters.get(r.providerId);
  if(!adapter||!this.allowed(r))return 'NOT_CONNECTED';
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let o:AdjustmentObservation|null;
  try{
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(Error('Adjustment observation deadline'));controller.abort();},this.timeoutMs);});
   o=await Promise.race([deadline,Promise.resolve().then(()=>adapter.observeAdjustment(r,controller.signal))]);
  }catch{return 'RETRY_REQUIRED';}
  finally{if(timer!==undefined)clearTimeout(timer);}
  if(controller.signal.aborted||!this.allowed(r))return 'NOT_CONNECTED';
  if(!o)return 'PENDING';
  const snapshot=Object.freeze({...o});
  if(snapshot.organizationId!==r.organizationId||snapshot.invoiceId!==r.invoiceId||snapshot.providerId!==r.providerId||snapshot.transactionId!==r.transactionId||snapshot.adjustmentId!==r.adjustmentId||snapshot.kind!==r.kind||
   snapshot.currency!=='UGX'||!Number.isSafeInteger(snapshot.amountUgx)||snapshot.amountUgx<1||snapshot.amountUgx>1000000000)return 'REVIEW_REQUIRED';
  if(snapshot.state==='PENDING')return 'PENDING';
  if(snapshot.state!=='CONFIRMED')return 'REVIEW_REQUIRED';
  return this.repository.record(r,snapshot);
 }
}
