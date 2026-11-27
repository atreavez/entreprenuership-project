import {randomUUID} from 'node:crypto';
import type {Database} from '../../../database';
import type {PoolClient} from 'pg';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {createJob,validateSettings,type AnchorJob,type AnchorJobRepository} from '../domain/anchor-job-policy';
const clock="floor(extract(epoch FROM clock_timestamp())*1000)::bigint";
function safeInteger(value:unknown):number{
 if(value===null||value===undefined)throw Error('Missing persisted integer');
 const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid persisted integer');return n;
}
export function hydrateAnchorJob(r:any):AnchorJob{
 return Object.freeze({id:r.id,organizationId:r.organization_id,commitment:r.commitment,settings:validateSettings(r.settings),
  revision:safeInteger(r.revision),state:r.state,transactionId:r.transaction_id,failures:safeInteger(r.failures),
  nextRunAt:r.next_run_at===null?null:safeInteger(r.next_run_at),confirmations:r.confirmations===null?null:safeInteger(r.confirmations)});
}
async function appendHistory(tx:PoolClient,job:AnchorJob){
 await tx.query('INSERT INTO public.anchor_job_history(organization_id,job_id,revision,snapshot) VALUES($1,$2,$3,$4::jsonb)',
  [job.organizationId,job.id,job.revision,JSON.stringify(job)]);
}
/** Not registered in Nest until the admin and deployment dispatch gates are wired.
 * Call only after current tenant/admin authority has been established.
 */
export class PgAnchorJobRepository implements AnchorJobRepository {
 constructor(private readonly db:Database){}
 async createOrGet(job:AnchorJob):Promise<AnchorJob>{
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,job.organizationId);
   return (await this.createOrGetInTransaction(tx,job)).job;
  });
 }
 /** Caller owns transaction and must lock current authority before invoking. */
 async createOrGetInTransaction(tx:PoolClient,job:AnchorJob):Promise<{job:AnchorJob;created:boolean}>{
  // Never accept an arbitrary initial confirmed state from a caller.
  const initial=createJob(job.id,job.organizationId,job.commitment,job.settings,job.nextRunAt??0);
  await setTenantScope(tx,initial.organizationId);
   const p=[initial.id,initial.organizationId,initial.commitment,initial.settings.target.providerId,initial.settings.target.networkId,
    JSON.stringify(initial.settings),initial.state,initial.nextRunAt];
   const inserted=await tx.query(`INSERT INTO public.anchor_jobs(id,organization_id,commitment,provider_id,network_id,settings,state,next_run_at,failures)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,0) ON CONFLICT (organization_id,provider_id,network_id,commitment) DO NOTHING RETURNING *`,p);
   if(inserted.rowCount===1){const created=hydrateAnchorJob(inserted.rows[0]);await appendHistory(tx,created);return {job:created,created:true};}
   const existing=await tx.query(`SELECT * FROM public.anchor_jobs WHERE organization_id=$1 AND provider_id=$2 AND network_id=$3 AND commitment=$4`,
    [initial.organizationId,initial.settings.target.providerId,initial.settings.target.networkId,initial.commitment]);
   if(existing.rowCount!==1)throw Error('Anchor job conflict could not be resolved');
   return {job:hydrateAnchorJob(existing.rows[0]),created:false};
 }
 async claim(organizationId:string,now:number,leaseUntil:number):Promise<{job:AnchorJob;leaseToken:string}|null>{
  const duration=leaseUntil-now;
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(leaseUntil)||!Number.isSafeInteger(duration)||duration<1000||duration>300000)throw Error('Invalid lease duration');
  const leaseToken=randomUUID();
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,organizationId);
   const claimed=await tx.query(`WITH candidate AS (
    SELECT id FROM public.anchor_jobs WHERE organization_id=$1 AND next_run_at<=${clock}
     AND (lease_until IS NULL OR lease_until<=${clock})
     AND state NOT IN ('BLOCKED','MANUAL_REVIEW') ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE public.anchor_jobs j SET lease_token=$2,lease_until=${clock}+$3::bigint
     FROM candidate WHERE j.id=candidate.id AND j.organization_id=$1 RETURNING j.*`,[organizationId,leaseToken,duration]);
   return claimed.rowCount===1?{job:hydrateAnchorJob(claimed.rows[0]),leaseToken}:null;
  });
 }
 async save(organizationId:string,expectedRevision:number,leaseToken:string,next:AnchorJob):Promise<boolean>{
  if(next.organizationId!==organizationId||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||next.revision!==expectedRevision+1)throw Error('Invalid tenant or job revision');
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,organizationId);
   const result=await tx.query(`UPDATE public.anchor_jobs SET revision=$5,state=$6,transaction_id=$7,failures=$8,next_run_at=$9,confirmations=$10,
    lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND id=$2 AND revision=$3 AND lease_token=$4
    AND lease_until>${clock} AND commitment=$11 AND settings=$12::jsonb
    AND (transaction_id IS NULL OR transaction_id=$7) RETURNING *`,
    [organizationId,next.id,expectedRevision,leaseToken,next.revision,next.state,next.transactionId,next.failures,next.nextRunAt,next.confirmations,
     next.commitment,JSON.stringify(validateSettings(next.settings))]);
   if(result.rowCount!==1)return false;
   await appendHistory(tx,hydrateAnchorJob(result.rows[0]));
   return true;
  });
 }
}
