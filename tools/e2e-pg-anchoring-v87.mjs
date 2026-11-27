/** Disposable PostgreSQL acceptance for the actual built anchoring repository.
 * No blockchain adapter or external requests. Synthetic tenant rows only.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE,REQUIRED_RLS_TABLES,evaluateDatabaseRole}=require('./runtime-role-policy-v57.cjs');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||process.env.ASSETTRUST_V87_ANCHOR_PG_CONFIRM!=='YES'||
 process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')throw Error('BLOCKED: supervised disposable anchoring test required');
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('BLOCKED: unexpected database');
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const {PgAnchorJobRepository}=require('../apps/api/dist/contexts/anchoring/infrastructure/pg-anchor-job.repository.js');
const {createJob,applyOutcome}=require('../apps/api/dist/contexts/anchoring/domain/anchor-job-policy.js');
const options={connectionTimeoutMillis:5000,statement_timeout:10000,lock_timeout:3000};
const operator=new pg.Client({...options,connectionString:process.env.DATABASE_URL});
const pool=new pg.Pool({...options,connectionString:process.env.ASSETTRUST_RUNTIME_DATABASE_URL,max:4});
const orgs=[randomUUID(),randomUUID()],seeded=[];
const config={version:1,enabled:true,target:{providerId:'ci-offline',networkId:'ci-test',minConfirmations:6},retryBaseMs:1000,maxAttempts:3,pollMs:5000};
const db={transaction:async fn=>{
 const tx=await pool.connect();let discard=false;
 try{await tx.query('BEGIN');const result=await fn(tx);await tx.query('COMMIT');return result;}
 catch(e){try{await tx.query('ROLLBACK');}catch{discard=true;}throw e;}
 finally{tx.release(discard);}
}};
const scoped=(org,fn)=>db.transaction(async tx=>{await tx.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);return fn(tx);});
const jobs=new PgAnchorJobRepository(db);
let checks=0,connected=false,failed=false;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function denied(tx,sql,params){
 await tx.query('SAVEPOINT forbidden');
 try{await assert.rejects(tx.query(sql,params),e=>e?.code==='42501');checks++;}
 finally{await tx.query('ROLLBACK TO SAVEPOINT forbidden');await tx.query('RELEASE SAVEPOINT forbidden');}
}
try{
 await operator.connect();connected=true;
 const admin=(await operator.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 check(admin?.rolsuper||admin?.rolbypassrls,'Disposable fixture cleanup requires operator bypass');
 const identity=(await pool.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
 const tables=(await pool.query('SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS table_owner FROM pg_class WHERE oid=ANY($1::regclass[])',[REQUIRED_RLS_TABLES.map(n=>'public.'+n)])).rows;
 check(identity?.name===RUNTIME_ROLE&&evaluateDatabaseRole({role:identity,tables},identity.name).ok,'Restricted RLS role required');
 for(const org of orgs){await operator.query('INSERT INTO public.organizations(id,name) VALUES($1,$2)',[org,'Synthetic anchoring acceptance '+org]);seeded.push(org);}
 const [a,b]=orgs,commitment=randomBytes(32).toString('hex');
 const initial=createJob(randomUUID(),a,commitment,config,Date.now()-1000);
 const other=await jobs.createOrGet(createJob(randomUUID(),b,commitment,config,Date.now()-1000));
 const copies=await Promise.all([jobs.createOrGet(initial),jobs.createOrGet({...initial,id:randomUUID()})]);
 const job=copies[0];
 check(copies[1].id===job.id&&job.organizationId===a&&other.id!==job.id,'Concurrent dedupe scoped by tenant');
 const count=await pool.query('SELECT id FROM public.anchor_jobs WHERE id=ANY($1::uuid[])',[[job.id,other.id]]);
 check(count.rowCount===0,'Unscoped job visibility must be zero');
 await scoped(a,async tx=>{
  const own=await tx.query('SELECT id FROM public.anchor_jobs WHERE id=ANY($1::uuid[])',[[job.id,other.id]]);
  check(own.rowCount===1&&own.rows[0].id===job.id,'Only exact own tenant job visible');
  const hist=await tx.query('SELECT job_id FROM public.anchor_job_history WHERE job_id=ANY($1::uuid[])',[[job.id,other.id]]);
  check(hist.rowCount===1&&hist.rows[0].job_id===job.id,'Only own history visible');
  await denied(tx,'UPDATE public.anchor_job_history SET snapshot=$2::jsonb WHERE job_id=$1',[job.id,'{}']);
  await denied(tx,'DELETE FROM public.anchor_job_history WHERE job_id=$1',[job.id]);
  await denied(tx,'TRUNCATE public.anchor_job_history',[]);
  await denied(tx,'UPDATE public.anchor_jobs SET organization_id=$2 WHERE id=$1',[job.id,b]);
 });
 const now=Date.now();
 const claims=await Promise.all([jobs.claim(a,now,now+30000),jobs.claim(a,now,now+30000)]);
 const first=claims.find(Boolean);
 check(claims.filter(Boolean).length===1&&first.job.id===job.id,'Exactly one concurrent worker claims job');
 // Force expiration for this synthetic row using operator, not wall-clock sleeping.
 await operator.query('UPDATE public.anchor_jobs SET lease_until=0 WHERE organization_id=$1 AND id=$2',[a,job.id]);
 const later=Date.now(),second=await jobs.claim(a,later,later+30000);
 check(second&&second.leaseToken!==first.leaseToken&&second.job.revision===0,'Expired lease reclaimed with new token');
 const next=applyOutcome(second.job,{state:'SUBMITTED',anchored:false,transactionId:'synthetic-transaction'},Date.now());
 check(await jobs.save(a,0,first.leaseToken,next)===false,'Stale lease cannot save');
 check(await jobs.save(a,0,second.leaseToken,next)===true,'Current lease saves once');
 check(await jobs.save(a,0,second.leaseToken,next)===false,'Duplicate revision rejected');
 await scoped(a,async tx=>{
  const result=await tx.query('SELECT state,revision,transaction_id FROM public.anchor_jobs WHERE id=$1',[job.id]);
  check(result.rows[0]?.state==='SUBMITTED'&&Number(result.rows[0].revision)===1&&result.rows[0].transaction_id==='synthetic-transaction','Persisted transaction and revision exact');
  const history=await tx.query('SELECT revision,snapshot FROM public.anchor_job_history WHERE job_id=$1 ORDER BY revision',[job.id]);
  check(history.rows.length===2&&Number(history.rows[0].revision)===0&&Number(history.rows[1].revision)===1&&history.rows[1].snapshot.transactionId==='synthetic-transaction','Exactly one immutable history record per revision');
 });
}catch(e){failed=true;console.error('Anchoring acceptance failed: '+(e instanceof assert.AssertionError?e.message:'database or repository operation failed'));}
finally{
 try{await pool.end();}catch{failed=true;}
 if(connected){
  for(const org of seeded){
   try{
    await operator.query('BEGIN');
    await operator.query('DELETE FROM public.anchor_job_history WHERE organization_id=$1',[org]);
    await operator.query('DELETE FROM public.anchor_jobs WHERE organization_id=$1',[org]);
    await operator.query('DELETE FROM public.organizations WHERE id=$1',[org]);
    await operator.query('COMMIT');
    const remaining=await operator.query('SELECT id FROM public.organizations WHERE id=$1',[org]);
    assert.equal(remaining.rowCount,0);
   }catch{failed=true;await operator.query('ROLLBACK').catch(()=>{});console.error('Synthetic fixture cleanup failed');}
  }
  try{await operator.end();}catch{failed=true;}
 }
}
if(failed)process.exitCode=1;
else console.log(JSON.stringify({schema:'ASSETTRUST_V87_ANCHOR_PG',status:'PASSED',checks,productionApproved:false,externalBlockchainTested:false}));
