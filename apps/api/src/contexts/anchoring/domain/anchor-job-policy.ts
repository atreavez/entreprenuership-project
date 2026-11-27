/** Pure anchoring administration and job lifecycle. Persistence and authority are separate ports. */
import type {AnchorTarget,AnchorOutcome} from '../application/anchor-service';
const id=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
function validId(v:unknown):v is string{return typeof v==='string'&&id.test(v);}
function integer(v:unknown,min:number,max:number):v is number{return typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;}
export type AnchorSettings=Readonly<{version:number;enabled:boolean;target:AnchorTarget;retryBaseMs:number;maxAttempts:number;pollMs:number}>;
export function validateSettings(raw:unknown):AnchorSettings{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid anchor settings');
 const v=raw as Record<string,unknown>,t=v.target as Record<string,unknown>|undefined;
 if(Object.keys(v).some(k=>!['version','enabled','target','retryBaseMs','maxAttempts','pollMs'].includes(k))||
  !integer(v.version,0,Number.MAX_SAFE_INTEGER-1)||typeof v.enabled!=='boolean'||
  !t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['providerId','networkId','minConfirmations'].includes(k))||
  !validId(t.providerId)||!validId(t.networkId)||!integer(t.minConfirmations,1,10000)||
  !integer(v.retryBaseMs,1000,3600000)||!integer(v.maxAttempts,1,20)||!integer(v.pollMs,1000,86400000))
  throw Error('Invalid anchor settings; only adapter identifiers and bounded policy values are accepted');
 return Object.freeze({version:v.version,enabled:v.enabled,target:Object.freeze({providerId:t.providerId,networkId:t.networkId,minConfirmations:t.minConfirmations}),retryBaseMs:v.retryBaseMs,maxAttempts:v.maxAttempts,pollMs:v.pollMs});
}
/** Only invoke after current platform administrator authority has been checked by the calling application. */
export type SettingsProposal=Readonly<{proposerId:string;expectedVersion:number;settings:AnchorSettings;reason:string}>;
export function approveSettings(current:AnchorSettings,proposal:SettingsProposal,reviewerId:string):AnchorSettings{
 const previous=validateSettings(current),next=validateSettings(proposal.settings);
 if(!uuid.test(proposal.proposerId)||!uuid.test(reviewerId)||proposal.proposerId===reviewerId)throw Error('Independent administrator approval required');
 if(typeof proposal.reason!=='string'||proposal.reason.trim().length<12||proposal.reason.length>500)throw Error('Approval reason required');
 if(proposal.expectedVersion!==previous.version||next.version!==previous.version+1)throw Error('Stale or invalid settings version');
 return next;
}
export type JobState='QUEUED'|'RETRY_REQUIRED'|'SUBMITTED'|'PENDING'|'CONFIRMED'|'REORG_OR_INVALID'|'BLOCKED'|'MANUAL_REVIEW';
export type AnchorJob=Readonly<{id:string;organizationId:string;commitment:string;settings:AnchorSettings;revision:number;state:JobState;transactionId:string|null;failures:number;nextRunAt:number|null;confirmations:number|null}>;
export function createJob(idValue:string,organizationId:string,commitment:string,settings:AnchorSettings,now:number):AnchorJob{
 const config=validateSettings(settings);
 if(!uuid.test(idValue)||!uuid.test(organizationId)||!digest.test(commitment)||!integer(now,0,Number.MAX_SAFE_INTEGER-86400000))throw Error('Invalid anchor job');
 return Object.freeze({id:idValue,organizationId,commitment,settings:config,revision:0,state:config.enabled?'QUEUED':'BLOCKED',transactionId:null,failures:0,nextRunAt:config.enabled?now:null,confirmations:null});
}
export function nextOperation(job:AnchorJob,now:number):'SUBMIT'|'VERIFY'|null{
 if(!job.settings.enabled||job.nextRunAt===null||job.nextRunAt>now||job.state==='BLOCKED'||job.state==='MANUAL_REVIEW')return null;
 return job.transactionId?'VERIFY':'SUBMIT';
}
export function applyOutcome(job:AnchorJob,outcome:AnchorOutcome,now:number):AnchorJob{
 if(!integer(now,0,Number.MAX_SAFE_INTEGER-86400000)||!nextOperation(job,now))throw Error('Job is not eligible for processing');
 const base={...job,revision:job.revision+1,confirmations:null};
 if(outcome.state==='NOT_CONNECTED')return Object.freeze({...base,state:'BLOCKED',nextRunAt:null});
 if(outcome.state==='RETRY_REQUIRED'){
  const failures=job.failures+1;
  const delay=Math.min(86400000,job.settings.retryBaseMs*2**Math.min(failures-1,20));
  return Object.freeze({...base,failures,state:failures>=job.settings.maxAttempts?'MANUAL_REVIEW':'RETRY_REQUIRED',nextRunAt:failures>=job.settings.maxAttempts?null:now+delay});
 }
 if(!('transactionId' in outcome)||!validId(outcome.transactionId)||(job.transactionId&&job.transactionId!==outcome.transactionId))
  throw Error('Anchor transaction identity cannot change');
 if((job.transactionId===null)!==(outcome.state==='SUBMITTED'))throw Error('Outcome does not match job operation');
 if(outcome.state==='CONFIRMED'&&(outcome.anchored!==true||!integer(outcome.confirmations,job.settings.target.minConfirmations,Number.MAX_SAFE_INTEGER)))throw Error('Insufficient verified confirmations');
 if(outcome.state!=='CONFIRMED'&&outcome.anchored!==false)throw Error('Unconfirmed outcome cannot claim anchoring');
 return Object.freeze({...base,state:outcome.state,transactionId:outcome.transactionId,failures:0,
  confirmations:outcome.state==='CONFIRMED'?outcome.confirmations:null,nextRunAt:now+job.settings.pollMs});
}
/** Infrastructure must implement atomic, tenant-scoped persistence, uniqueness and fenced leases.
 * Append audit history in the same transaction as a successful revision change.
 * No implementation may use a global unscoped lookup or acknowledge stale lease results.
 */
export interface AnchorJobRepository {
 createOrGet(job:AnchorJob):Promise<AnchorJob>; // unique organization + provider + network + commitment
 claim(organizationId:string,now:number,leaseUntil:number):Promise<{job:AnchorJob;leaseToken:string}|null>;
 save(organizationId:string,expectedRevision:number,leaseToken:string,next:AnchorJob):Promise<boolean>;
}
