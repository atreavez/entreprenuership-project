import type {ReconciliationRequest,ReconciliationResult} from '../application/reconciliation.service';
const identifier=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export const PAYMENT_POLICY_KEY='billing.reconciliation_policy';
export type PaymentPolicy=Readonly<{version:number;enabled:boolean;providers:readonly string[];retryBaseMs:number;pollMs:number;maxAttempts:number}>;
export function validatePaymentPolicy(raw:unknown):PaymentPolicy{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid reconciliation policy');
 const v=raw as Record<string,unknown>;
 const keys=['version','enabled','providers','retryBaseMs','pollMs','maxAttempts'];
 if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||!integer(v.version,1,2147483647)||typeof v.enabled!=='boolean'||
 !Array.isArray(v.providers)||v.providers.length>20||v.providers.some(p=>typeof p!=='string'||!identifier.test(p))||new Set(v.providers).size!==v.providers.length||
 (v.enabled&&!v.providers.length)||!integer(v.retryBaseMs,1000,3600000)||!integer(v.pollMs,1000,86400000)||!integer(v.maxAttempts,1,20))throw Error('Invalid reconciliation policy fields');
 return Object.freeze({version:v.version,enabled:v.enabled,providers:Object.freeze([...v.providers].sort()),retryBaseMs:v.retryBaseMs,pollMs:v.pollMs,maxAttempts:v.maxAttempts});
}
export function parsePaymentPolicyText(value:unknown,version:number):PaymentPolicy{
 if(typeof value!=='string'||value.length>4000)throw Error('Invalid reconciliation policy JSON');
 const data=JSON.parse(value);
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.hasOwn(data,'version'))throw Error('Invalid reconciliation policy JSON');
 return validatePaymentPolicy({...data,version});
}
export function canonicalPaymentPolicyText(value:unknown):string{
 const {version,...p}=parsePaymentPolicyText(value,1);return JSON.stringify(p);
}
export type ReconciliationJob=Readonly<{
 id:string;request:ReconciliationRequest;policy:PaymentPolicy;state:'QUEUED'|'PENDING'|'RETRY_REQUIRED'|'BLOCKED'|'REVIEW_REQUIRED'|'SETTLED';
 revision:number;attempts:number;nextRunAt:number|null;
}>;
export type JobClaim=Readonly<{job:ReconciliationJob;leaseToken:string}>;
const maxClock=Number.MAX_SAFE_INTEGER-86400000;
export function createReconciliationJob(id:string,r:ReconciliationRequest,raw:PaymentPolicy,now:number):ReconciliationJob{
 const policy=validatePaymentPolicy(raw);
 if(!uuid.test(id)||!uuid.test(r.organizationId)||!uuid.test(r.invoiceId)||!identifier.test(r.providerId)||!identifier.test(r.transactionId)||!integer(now,0,maxClock))throw Error('Invalid reconciliation job');
 const enabled=policy.enabled&&policy.providers.includes(r.providerId);
 return Object.freeze({id,request:Object.freeze({...r}),policy,state:enabled?'QUEUED':'BLOCKED',revision:0,attempts:0,nextRunAt:enabled?now:null});
}
export function currentPolicyMatches(job:ReconciliationJob,current:PaymentPolicy):boolean{
 const p=validatePaymentPolicy(current);
 return p.enabled&&p.providers.includes(job.request.providerId)&&JSON.stringify(p)===JSON.stringify(validatePaymentPolicy(job.policy));
}
export function applyReconciliationOutcome(job:ReconciliationJob,outcome:ReconciliationResult,now:number):ReconciliationJob{
 if(job.nextRunAt===null||!integer(now,job.nextRunAt,maxClock)||!integer(job.revision,0,Number.MAX_SAFE_INTEGER-2))throw Error('Job is not due');
 const base={...job,revision:job.revision+1};
 if(outcome==='SETTLED'||outcome==='ALREADY_SETTLED')return Object.freeze({...base,state:'SETTLED',nextRunAt:null});
 if(outcome==='NOT_CONNECTED')return Object.freeze({...base,state:'BLOCKED',nextRunAt:null});
 if(outcome==='REVIEW_REQUIRED'||outcome==='NOT_FOUND')return Object.freeze({...base,state:'REVIEW_REQUIRED',nextRunAt:null});
 if(outcome!=='PENDING'&&outcome!=='RETRY_REQUIRED')throw Error('Unknown reconciliation outcome');
 // Pending polls count toward the same finite budget; no infinite retry loop.
 const attempts=job.attempts+1;
 if(attempts>=job.policy.maxAttempts)return Object.freeze({...base,attempts,state:'REVIEW_REQUIRED',nextRunAt:null});
 const delay=outcome==='PENDING'?job.policy.pollMs:Math.min(86400000,job.policy.retryBaseMs*2**(attempts-1));
 return Object.freeze({...base,attempts,state:outcome,nextRunAt:now+delay});
}
export function recoverReconciliationJob(job:ReconciliationJob,current:PaymentPolicy,revision:number,now:number):ReconciliationJob{
 if(!['BLOCKED','REVIEW_REQUIRED'].includes(job.state)||job.revision!==revision||!integer(revision,0,Number.MAX_SAFE_INTEGER-2)||!integer(now,0,maxClock)||!currentPolicyMatches(job,current))throw Error('Recovery requires stopped job and original approved policy');
 return Object.freeze({...job,state:'QUEUED',attempts:0,revision:revision+1,nextRunAt:now});
}
export interface ReconciliationJobs{
 createOrGet(job:ReconciliationJob):Promise<ReconciliationJob>;
 claim(organizationId:string,leaseMs:number):Promise<JobClaim|null>;
 save(claim:JobClaim,next:ReconciliationJob):Promise<boolean>;
}
