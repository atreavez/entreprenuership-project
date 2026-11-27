import type {PaymentPort} from './payment.port';
import type {PaymentObservation} from '../domain/commercial-policy';
export type ReconciliationRequest=Readonly<{organizationId:string;invoiceId:string;providerId:string;transactionId:string}>;
export type SettlementResult='SETTLED'|'ALREADY_SETTLED'|'REVIEW_REQUIRED'|'NOT_FOUND';
export type ReconciliationResult=SettlementResult|'NOT_CONNECTED'|'PENDING'|'RETRY_REQUIRED';
/** Only a trusted scheduler supplies requests; no HTTP payment-assertion route.
 * The gate is deployment-controlled and defaults to disabled. */
export interface ReconciliationGate{
 authorized(request:ReconciliationRequest):boolean;
}
export interface SettlementRepository{
 settle(request:ReconciliationRequest,observation:PaymentObservation):Promise<SettlementResult>;
}
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export function validateReconciliationRequest(r:ReconciliationRequest):void{
 if(!r||!uuid(r.organizationId)||!uuid(r.invoiceId)||!identifier(r.providerId)||!identifier(r.transactionId))throw Error('Invalid reconciliation locator');
}
export function matchingObservation(r:ReconciliationRequest,o:PaymentObservation|null):boolean{
 return !!o&&o.providerId===r.providerId&&o.transactionId===r.transactionId&&o.invoiceId===r.invoiceId&&o.organizationId===r.organizationId&&o.currency==='UGX'&&
 typeof o.amountUgx==='number'&&Number.isSafeInteger(o.amountUgx)&&o.amountUgx>=1&&o.amountUgx<=1000000000&&['PENDING','SETTLED','FAILED'].includes(o.state);
}
export class PaymentAdapterRegistry{
 private readonly providers=new Map<string,PaymentPort>();
 constructor(adapters:readonly PaymentPort[]=[]){
  for(const adapter of adapters){
   if(!adapter||!identifier(adapter.providerId)||typeof adapter.observe!=='function'||this.providers.has(adapter.providerId))throw Error('Invalid or duplicate payment adapter');
   this.providers.set(adapter.providerId,adapter);
  }
 }
 resolve(providerId:string):PaymentPort|null{return this.providers.get(providerId)??null;}
}
export class ReconciliationService{
 constructor(private readonly registry:PaymentAdapterRegistry,private readonly gate:ReconciliationGate,
  private readonly repository:SettlementRepository,private readonly timeoutMs=15000){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid payment observation deadline');
 }
 async reconcile(input:ReconciliationRequest):Promise<ReconciliationResult>{
  validateReconciliationRequest(input);
  const request=Object.freeze({...input});
  if(!this.gate.authorized(request))return 'NOT_CONNECTED';
  const adapter=this.registry.resolve(request.providerId);
  if(!adapter)return 'NOT_CONNECTED';
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let observation:PaymentObservation|null;
  try{
   const deadline=new Promise<null>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Observation deadline'));},this.timeoutMs);});
   observation=await Promise.race([deadline,Promise.resolve().then(()=>adapter.observe(request.transactionId,controller.signal))]);
  }catch{return 'RETRY_REQUIRED';}
  finally{if(timer!==undefined)clearTimeout(timer);}
  if(controller.signal.aborted||!this.gate.authorized(request))return 'NOT_CONNECTED';
  if(!observation)return 'PENDING';
  const snapshot=Object.freeze({...observation});
  if(!matchingObservation(request,snapshot)||snapshot.state==='FAILED')return 'REVIEW_REQUIRED';
  if(snapshot.state!=='SETTLED')return 'PENDING';
  // No provider I/O is performed inside the persistence transaction.
  return this.repository.settle(request,snapshot);
 }
}
