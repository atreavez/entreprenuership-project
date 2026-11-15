/**
 * v0.60 opt-in repair for an ALREADY PROVISIONED disposable v0.57 API role.
 * It only revokes internal write privileges; never creates/rotates credentials,
 * alters data, or operates against a non-loopback, non-disposable database.
 */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||
   process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||
   process.env.ASSETTRUST_V60_REVOKE_CONFIRM!=='YES'||
   process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')
 throw Error('BLOCKED: disposable CI mode and explicit v0.60 grant-revocation consent required');
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))
 throw Error('BLOCKED: only designated disposable PostgreSQL databases allowed');
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const operator=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v60-grant-revocation'});
await operator.connect();
try{
 const {rows}=await operator.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=$1',[RUNTIME_ROLE]);
 const role=rows[0];
 if(!role?.rolcanlogin||role.rolsuper||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole)
  throw Error('Refusing to adjust missing or unexpectedly privileged runtime role');
 await operator.query('BEGIN');
 try{
  await operator.query(`REVOKE INSERT,UPDATE,DELETE ON TABLE public.assettrust_schema_migrations FROM ${RUNTIME_ROLE}`);
  await operator.query(`REVOKE UPDATE,DELETE ON TABLE public.audit_events FROM ${RUNTIME_ROLE}`);
  await operator.query('COMMIT');
 }catch(e){await operator.query('ROLLBACK').catch(()=>{});throw e;}
 console.log(JSON.stringify({schema:'ASSETTRUST_V60_DISPOSABLE_GRANT_REPAIR',ok:true,
  role:RUNTIME_ROLE,scope:'disposable-ci-only',productionApproved:false}));
}catch(e){console.error('FAIL v0.60 disposable grant repair: '+e.message);process.exitCode=1;
}finally{await operator.end();}
