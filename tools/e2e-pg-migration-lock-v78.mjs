/**
 * v0.78 read-only PostgreSQL migration lock acceptance.
 * Always runs against an explicitly authorized disposable loopback database.
 * Holds an advisory lock in session A, proves runner B refuses promptly,
 * releases the lock, then proves the full 27-file ledger still checks cleanly.
 * No schema, ledger, tenant, document, audit or payment writes.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const PLAN={schema:'ASSETTRUST_V78_PG_MIGRATION_LOCK_PLAN',productionApproved:false,status:'NOT_EXECUTED',
 target:'DISPOSABLE_LOOPBACK_ONLY',modifiesBusinessData:false,
 checks:['independent session obtains migration lock','contending runner refuses before catalog queries',
 'ledger remains unchanged under contention','release of first session permits full 27-migration check'],
 requires:['CI=true','NODE_ENV=test','ASSETTRUST_E2E_ALLOW_MUTATION=YES',
 'ASSETTRUST_V78_PG_CONFIRM=YES','trusted loopback assettrust_ci or assettrust_test database','reviewed installed pg dependency']};
const action=process.argv[2];
if(process.argv.length!==3||!['--plan','--run'].includes(action)){console.error('Use --plan or --run');process.exitCode=2;}
else if(action==='--plan')console.log(JSON.stringify(PLAN,null,2));
else{
 let owner,locked=false,failed=false,checks=0;
 try{
  if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||process.env.ASSETTRUST_V78_PG_CONFIRM!=='YES')throw new Error('DISPOSABLE_CONFIRMATION_REQUIRED');
  const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
  const target=validateDisposablePgTarget(process.env);
  if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw new Error('UNSAFE_TEST_DATABASE');
  const {Client}=require('pg');
  const {run,MIGRATION_LOCK_ID}=require('./migrations/run.cjs');
  owner=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v78-lock-check'});
  await owner.connect();
  const acquired=await owner.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[MIGRATION_LOCK_ID]);
  assert.equal(acquired.rows[0]?.acquired,true);locked=true;checks++;
  const before=await owner.query('SELECT filename,sha256 FROM assettrust_schema_migrations ORDER BY filename');
  assert.equal(before.rows.length,27,'Expected 27 audited migration ledger entries');checks++;
  const started=Date.now();
  await assert.rejects(run({connectionString:process.env.DATABASE_URL,quiet:true}),/Another migration\/check owns the schema lock/);
  assert(Date.now()-started<10000,'Concurrent migration check did not refuse promptly');checks++;
  const still=await owner.query('SELECT filename,sha256 FROM assettrust_schema_migrations ORDER BY filename');
  assert.deepEqual(still.rows,before.rows);checks++;
  const released=await owner.query('SELECT pg_advisory_unlock($1::bigint) AS released',[MIGRATION_LOCK_ID]);
  assert.equal(released.rows[0]?.released,true);locked=false;checks++;
  const checked=await run({connectionString:process.env.DATABASE_URL,check:true,quiet:true});
  assert.equal(checked.checked,27);checks++;
  console.log(JSON.stringify({schema:'ASSETTRUST_V78_REAL_PG_RESULT',status:'PASSED',checks,
   productionApproved:false,releaseStatus:'NO_GO'}));
 }catch(error){failed=true;console.error(JSON.stringify({schema:'ASSETTRUST_V78_REAL_PG_RESULT',status:'FAILED',checks,
  reason:['DISPOSABLE_CONFIRMATION_REQUIRED','UNSAFE_TEST_DATABASE'].includes(error?.message)?error.message:'MIGRATION_LOCK_OR_LEDGER_CHECK_FAILED',
  productionApproved:false,releaseStatus:'NO_GO'}));}
 finally{
  if(owner){
   if(locked)try{await owner.query('SELECT pg_advisory_unlock($1::bigint)',[1642872011]);}catch{failed=true;}
   try{await owner.end();}catch{failed=true;}
  }
 }
 if(failed)process.exitCode=1;
}
