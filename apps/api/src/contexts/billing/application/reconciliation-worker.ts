import {applyReconciliationOutcome,type JobClaim,type ReconciliationJobs} from '../domain/reconciliation-job';
import type {ReconciliationResult,ReconciliationService} from './reconciliation.service';
/** A claim-bound factory must construct a settlement repository with a
 * transaction-level fence. A queue ACK and settlement may be separate commits:
 * the durable provider reference makes retries after an interrupted ACK safe.
 */
export interface ClaimServiceFactory{
 resolve(claim:JobClaim):Promise<ReconciliationService|null>;
}
export class ReconciliationWorker{
 constructor(private readonly jobs:ReconciliationJobs,private readonly services:ClaimServiceFactory,private readonly enabled:()=>boolean,
  private readonly leaseMs=90000,private readonly now=Date.now){
  if(!Number.isSafeInteger(leaseMs)||leaseMs<45000||leaseMs>300000)throw Error('Invalid reconciliation lease');
 }
 async runOne(org:string):Promise<'IDLE'|'SAVED'|'LEASE_LOST'>{
  if(!this.enabled())return 'IDLE';
  const claim=await this.jobs.claim(org,this.leaseMs);
  if(!claim)return 'IDLE';
  if(claim.job.request.organizationId!==org)throw Error('Reconciliation tenant mismatch');
  let result:ReconciliationResult;
  try{
   const service=await this.services.resolve(claim);
   result=service&&this.enabled()?await service.reconcile(claim.job.request):'NOT_CONNECTED';
  }catch{result='RETRY_REQUIRED';}
  const next=applyReconciliationOutcome(claim.job,result,Math.max(this.now(),claim.job.nextRunAt??0));
  return await this.jobs.save(claim,next)?'SAVED':'LEASE_LOST';
 }
}
