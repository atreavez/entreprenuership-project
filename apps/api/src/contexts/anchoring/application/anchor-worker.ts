import {AnchorService,type AnchorOutcome} from './anchor-service';
import {applyOutcome,nextOperation,type AnchorJob,type AnchorJobRepository} from '../domain/anchor-job-policy';
/** Trusted control-plane gate. Must check current approved provider settings and
 * deployment authorization, not the historical job snapshot or client claims.
 * Resolve only an allowlisted adapter; return null for disabled/unavailable.
 */
export interface AnchorDispatchGate {
 resolve(job:AnchorJob,operation:'SUBMIT'|'VERIFY',signal?:AbortSignal):Promise<AnchorService|null>;
}
export type WorkerResult='IDLE'|'SAVED'|'LEASE_LOST';
/** One bounded unit of work. Scheduler must supply authorized tenant scopes.
 * No network I/O inside a database transaction. A timed-out submit may have
 * succeeded, so replay MUST use the same provider idempotency key.
 */
export class AnchorWorker {
 constructor(private readonly jobs:AnchorJobRepository,private readonly gate:AnchorDispatchGate,
  private readonly now:()=>number=Date.now,private readonly leaseMs:number=60000,private readonly timeoutMs:number=20000){
  if(!Number.isSafeInteger(leaseMs)||leaseMs<2000||leaseMs>300000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>=leaseMs-1000)throw Error('Invalid worker timing budget');
 }
 async runOne(organizationId:string):Promise<WorkerResult>{
  const started=this.now();
  const claim=await this.jobs.claim(organizationId,started,started+this.leaseMs);
  if(!claim)return 'IDLE';
  const {job,leaseToken}=claim;
  if(job.organizationId!==organizationId)throw Error('Anchor worker tenant mismatch');
  const operation=nextOperation(job,Math.max(started,job.nextRunAt??started));
  if(!operation)throw Error('Claimed anchor job is not eligible');
  let result:AnchorOutcome;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const work=async():Promise<AnchorOutcome>=>{
    const service=await this.gate.resolve(job,operation,controller.signal);
    if(controller.signal.aborted)return {state:'RETRY_REQUIRED',anchored:false};
    if(!service)return {state:'NOT_CONNECTED',anchored:false};
    if(operation==='SUBMIT')return service.submit(job.settings.target,job.commitment,controller.signal);
    return service.verify(job.settings.target,job.commitment,job.transactionId!,controller.signal);
   };
   const deadline=new Promise<AnchorOutcome>(resolve=>{
    timer=setTimeout(()=>{controller.abort();resolve({state:'RETRY_REQUIRED',anchored:false});},this.timeoutMs);
   });
   result=await Promise.race([deadline,work()]);
  }catch{result={state:'RETRY_REQUIRED',anchored:false};}
  finally{if(timer!==undefined)clearTimeout(timer);}
  const next=applyOutcome(job,result,Math.max(this.now(),job.nextRunAt??started));
  return await this.jobs.save(organizationId,job.revision,leaseToken,next)?'SAVED':'LEASE_LOST';
 }
}
