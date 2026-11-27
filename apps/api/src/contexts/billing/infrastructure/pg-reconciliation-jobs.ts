import {randomUUID} from 'node:crypto';
import type {Database} from '../../../database';
import type {PoolClient} from 'pg';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {REQUIRED_SCHEMA_MIGRATIONS} from '../../platform/domain/schema-manifest';
import {PROTECTED_TABLES} from '../../tenant-isolation/domain/rls-policy-contract';
import {PAYMENT_POLICY_KEY,parsePaymentPolicyText,createReconciliationJob,currentPolicyMatches,applyReconciliationOutcome,recoverReconciliationJob,validatePaymentPolicy,type ReconciliationJobs,type ReconciliationJob,type JobClaim,type PaymentPolicy} from '../domain/reconciliation-job';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import type {UserAuth} from '../../../common';
import type {AuditService} from '../../../audit';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
const clock="floor(extract(epoch FROM clock_timestamp())*1000)::bigint";
const policyLock='assettrust:admin:platform:'+PLATFORM_ID+':'+PAYMENT_POLICY_KEY;
function num(v:unknown):number{
 if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+$/.test(v)))throw Error('Invalid job integer');
 const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid job integer');return n;
}
export async function requireReconciliationSchema(tx:PoolClient):Promise<void>{
 const migration=REQUIRED_SCHEMA_MIGRATIONS.find(m=>String(m.filename)==='031_reconciliation_jobs.sql');
 if(!migration||!['billing_reconciliation_jobs','billing_reconciliation_history'].every(t=>PROTECTED_TABLES.includes(t)))throw Error('Reconciliation schema is staged');
 const {rows}=await tx.query('SELECT sha256 FROM public.assettrust_schema_migrations WHERE filename=$1',[migration.filename]);
 if(rows.length!==1||rows[0].sha256!==migration.sha256)throw Error('Reconciliation migration unverified');
}
export async function readCurrentPaymentPolicy(tx:PoolClient):Promise<PaymentPolicy|null>{
 // Same advisory key as the admin approval workflow. Hold through the
 // settlement transaction so a policy approval cannot race the final write.
 await tx.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))',[policyLock]);
 const {rows}=await tx.query(`SELECT v.version,v.value FROM public.admin_configuration_values v
  JOIN public.admin_configuration_changes c ON c.scope=v.scope AND c.scope_id=v.scope_id AND c.setting_key=v.setting_key
   AND c.expected_version=v.version-1 AND c.proposed_value=v.value
  WHERE v.scope='platform' AND v.scope_id=$1 AND v.setting_key=$2 AND c.status='APPROVED'
    AND c.reviewed_by IS NOT NULL AND c.reviewed_by<>c.submitted_by`,[PLATFORM_ID,PAYMENT_POLICY_KEY]);
 return rows.length===1?parsePaymentPolicyText(rows[0].value,num(rows[0].version)):null;
}
function hydrate(r:any):ReconciliationJob{
 const base=createReconciliationJob(r.id,{organizationId:r.organization_id,invoiceId:r.invoice_id,providerId:r.provider_id,transactionId:r.transaction_id},validatePaymentPolicy(r.policy),0);
 const revision=num(r.revision),attempts=num(r.attempts),nextRunAt=r.next_run_at===null?null:num(r.next_run_at),state=r.state;
 if(!['QUEUED','PENDING','RETRY_REQUIRED','BLOCKED','REVIEW_REQUIRED','SETTLED'].includes(state)||attempts>base.policy.maxAttempts||(['BLOCKED','REVIEW_REQUIRED','SETTLED'].includes(state))!==(nextRunAt===null))throw Error('Invalid persisted reconciliation state');
 return Object.freeze({...base,state,revision,attempts,nextRunAt});
}
async function append(tx:PoolClient,job:ReconciliationJob,reason?:string){
 await tx.query('INSERT INTO public.billing_reconciliation_history(organization_id,job_id,revision,snapshot) VALUES($1,$2,$3,$4::jsonb)',[job.request.organizationId,job.id,job.revision,JSON.stringify(reason?{job,reason}:{job})]);
}
async function dbNow(tx:PoolClient){return num((await tx.query('SELECT '+clock+' AS now_ms')).rows[0]?.now_ms);}
function same(a:ReconciliationJob,b:ReconciliationJob){return JSON.stringify(a)===JSON.stringify(b);}
/** Trusted internal adapter; not an HTTP route. Deployment remains disabled.
 * The same claim can be replayed after a crashed ACK because settlement is
 * independently deduplicated by the globally unique provider reference.
 */
export class PgReconciliationJobs implements ReconciliationJobs{
 constructor(private readonly db:Database){}
 async createOrGet(job:ReconciliationJob):Promise<ReconciliationJob>{
  return this.db.transaction(async tx=>{
   await requireReconciliationSchema(tx);await setTenantScope(tx,job.request.organizationId);
   const policy=await readCurrentPaymentPolicy(tx);
   if(!policy||!currentPolicyMatches(job,policy))throw Error('Current approved reconciliation policy required');
   const initial=createReconciliationJob(job.id,job.request,policy,await dbNow(tx)),r=initial.request;
   const existing=await tx.query('SELECT * FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND invoice_id=$2 AND provider_id=$3 AND transaction_id=$4',[r.organizationId,r.invoiceId,r.providerId,r.transactionId]);
   if(existing.rows.length===1)return hydrate(existing.rows[0]);
   const invoice=await tx.query("SELECT id FROM public.billing_invoices WHERE organization_id=$1 AND id=$2 AND state='ISSUED' FOR SHARE",[r.organizationId,r.invoiceId]);
   if(invoice.rows.length!==1)throw Error('Issued invoice required');
   const inserted=await tx.query(`INSERT INTO public.billing_reconciliation_jobs(id,organization_id,invoice_id,provider_id,transaction_id,policy,state,attempts,next_run_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,0,$8) ON CONFLICT(organization_id,invoice_id,provider_id,transaction_id) DO NOTHING RETURNING *`,[initial.id,r.organizationId,r.invoiceId,r.providerId,r.transactionId,JSON.stringify(initial.policy),initial.state,initial.nextRunAt]);
   if(inserted.rowCount===1){const result=hydrate(inserted.rows[0]);await append(tx,result);return result;}
   const found=await tx.query('SELECT * FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND invoice_id=$2 AND provider_id=$3 AND transaction_id=$4',[r.organizationId,r.invoiceId,r.providerId,r.transactionId]);
   if(found.rows.length!==1)throw Error('Job conflict could not be resolved');return hydrate(found.rows[0]);
  });
 }
 async claim(org:string,leaseMs:number):Promise<JobClaim|null>{
  if(!Number.isSafeInteger(leaseMs)||leaseMs<45000||leaseMs>300000)throw Error('Invalid job lease');
  const token=randomUUID();
  return this.db.transaction(async tx=>{
   await requireReconciliationSchema(tx);await setTenantScope(tx,org);
   const result=await tx.query(`WITH candidate AS (
    SELECT id FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND next_run_at<=${clock}
     AND (lease_until IS NULL OR lease_until<=${clock})
     ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE public.billing_reconciliation_jobs j SET lease_token=$2,lease_until=${clock}+$3::bigint
     FROM candidate WHERE j.id=candidate.id AND j.organization_id=$1 RETURNING j.*`,[org,token,leaseMs]);
   return result.rowCount===1?{job:hydrate(result.rows[0]),leaseToken:token}:null;
  });
 }
 async save(claim:JobClaim,next:ReconciliationJob):Promise<boolean>{
  const previous=claim.job,r=previous.request;
  return this.db.transaction(async tx=>{
   await requireReconciliationSchema(tx);await setTenantScope(tx,r.organizationId);
   const live=await tx.query(`SELECT * FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND id=$2 AND revision=$3 AND lease_token=$4 AND lease_until>${clock} FOR UPDATE`,[r.organizationId,previous.id,previous.revision,claim.leaseToken]);
   if(live.rows.length!==1)return false;
   if(!same(hydrate(live.rows[0]),previous))throw Error('Claim snapshot mismatch');
   // Independently derive the allowed transition. Due time is bounded by
   // the repository clock, rather than accepting arbitrary scheduling input.
   const now=await dbNow(tx);
   const outcomes=['SETTLED','ALREADY_SETTLED','NOT_CONNECTED','REVIEW_REQUIRED','NOT_FOUND','PENDING','RETRY_REQUIRED'] as const;
   const candidate=outcomes.map(o=>({outcome:o,job:applyReconciliationOutcome(previous,o,Math.max(now,previous.nextRunAt??0))})).find(x=>x.job.state===next.state&&x.job.attempts===next.attempts);
   if(!candidate||!same({...candidate.job,nextRunAt:next.nextRunAt},next))throw Error('Invalid acknowledgement transition');
   // A successful ACK must have corresponding persisted settlement evidence.
   if(candidate.job.state==='SETTLED'){
    const result=await tx.query(`SELECT s.invoice_id FROM public.billing_settlements s JOIN public.billing_invoices i
     ON i.organization_id=s.organization_id AND i.id=s.invoice_id
     WHERE s.organization_id=$1 AND s.invoice_id=$2 AND s.provider_id=$3 AND s.transaction_id=$4
     AND i.state='PAID' AND i.total_ugx=s.amount_ugx AND i.payment_key=$5`,[r.organizationId,r.invoiceId,r.providerId,r.transactionId,JSON.stringify([r.providerId,r.transactionId])]);
    if(result.rows.length!==1)throw Error('Settlement acknowledgement lacks persisted payment');
   }
   const derived=candidate.job;
   const updated=await tx.query(`UPDATE public.billing_reconciliation_jobs SET state=$5,revision=$6,attempts=$7,next_run_at=$8,lease_token=NULL,lease_until=NULL
    WHERE organization_id=$1 AND id=$2 AND revision=$3 AND lease_token=$4 AND lease_until>${clock} RETURNING *`,[r.organizationId,previous.id,previous.revision,claim.leaseToken,derived.state,derived.revision,derived.attempts,derived.nextRunAt]);
   if(updated.rowCount!==1)return false;await append(tx,hydrate(updated.rows[0]));return true;
  });
 }
 async recover(actor:UserAuth,sid:string,id:string,revision:number,reason:string,audit:AuditService):Promise<ReconciliationJob>{
  if(typeof reason!=='string'||reason.trim().length<12||reason.length>500)throw Error('Recovery reason required');
  return this.db.transaction(async tx=>{
   await requireReconciliationSchema(tx);await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   const policy=await readCurrentPaymentPolicy(tx);
   const {rows}=await tx.query('SELECT * FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND id=$2 AND lease_token IS NULL FOR UPDATE',[actor.organizationId,id]);
   if(rows.length!==1||!policy)throw Error('Stopped job not available');
   const next=recoverReconciliationJob(hydrate(rows[0]),policy,revision,await dbNow(tx));
   const update=await tx.query("UPDATE public.billing_reconciliation_jobs SET state=$4,revision=$5,attempts=0,next_run_at=$6 WHERE organization_id=$1 AND id=$2 AND revision=$3 AND lease_token IS NULL RETURNING *",[actor.organizationId,id,revision,next.state,next.revision,next.nextRunAt]);
   if(update.rowCount!==1)throw Error('Recovery conflict');
   const saved=hydrate(update.rows[0]);await append(tx,saved,reason.trim());await audit.write(tx,actor,'BILLING_RECONCILIATION_REQUEUED','invoice',saved.request.invoiceId,{jobId:id,revision:saved.revision,reason:reason.trim()});return saved;
  });
 }
}
/** Called inside the settlement transaction BEFORE financial writes. Lock the
 * policy and job lease. A stale claim cannot start a settlement. Recheck the
 * fence immediately before the first write as well.
 */
export async function verifySettlementClaim(tx:PoolClient,claim:JobClaim):Promise<boolean>{
 await requireReconciliationSchema(tx);
 const p=await readCurrentPaymentPolicy(tx);
 if(!p||!currentPolicyMatches(claim.job,p))return false;
 const r=claim.job.request;
 const {rows}=await tx.query(`SELECT * FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND id=$2 AND revision=$3 AND lease_token=$4 AND lease_until>${clock} FOR UPDATE`,[r.organizationId,claim.job.id,claim.job.revision,claim.leaseToken]);
 return rows.length===1&&same(hydrate(rows[0]),claim.job);
}
