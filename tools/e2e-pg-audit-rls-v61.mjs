/**
 * v0.61: LIVE disposable PostgreSQL RLS contract for append-only audit_events.
 * Two independent connections: operator seeds/cleans synthetic fixtures;
 * restricted API login proves tenant isolation and absence of edit privileges.
 * Only assettrust_ci/assettrust_test on loopback with explicit consent.
 * All created records are synthetic. On process interruption cleanup may not run.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
// Do not load pg or open connections until every guard passes.
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||
   process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||
   process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES'||
   process.env.ASSETTRUST_V61_AUDIT_RLS_CONFIRM!=='YES')
 throw Error('BLOCKED: disposable CI test mode, runtime role, and explicit v0.61 audit-fixture consent required');
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))
 throw Error('BLOCKED: unexpected database name');
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const operator=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v61-fixtures'});
const runtime=new pg.Client({connectionString:process.env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v61-runtime'});
const fixtures=[0,1].map(()=>({org:randomUUID(),user:randomUUID(),event:randomUUID()}));
const committed=[];
let opConnected=false,rtConnected=false,assertions=0;
async function seed(f,index){
 await operator.query('BEGIN');
 try{
  await operator.query('INSERT INTO public.organizations(id,name) VALUES($1,$2)',[f.org,`v61 disposable audit org ${index}`]);
  await operator.query(`INSERT INTO public.users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,'Synthetic Audit User',$3,'never-a-real-password','ORG_ADMIN')`,[f.user,f.org,`v61-${f.user}@example.invalid`]);
  await operator.query("SELECT set_config('assettrust.tenant_id',$1,true)",[f.org]);
  await operator.query(`INSERT INTO public.audit_events(id,organization_id,actor_id,action,entity_type,entity_id,detail,previous_hash,event_hash)
   VALUES($1,$2,$3,'SYNTHETIC_RLS_TEST','test',$4,'{}'::jsonb,'GENESIS',$5)`,[f.event,f.org,f.user,f.event,'a'.repeat(64)]);
  await operator.query('COMMIT');committed.push(f);
 }catch(e){await operator.query('ROLLBACK').catch(()=>{});throw e;}
}
async function cleanup(f){
 await operator.query('BEGIN');
 try{
  // CI operator is a superuser for fixture cleanup, NOT for API runtime tests.
  await operator.query('DELETE FROM public.audit_events WHERE id=$1 AND organization_id=$2',[f.event,f.org]);
  await operator.query('DELETE FROM public.users WHERE id=$1 AND organization_id=$2',[f.user,f.org]);
  await operator.query('DELETE FROM public.organizations WHERE id=$1',[f.org]);
  await operator.query('COMMIT');
 }catch(e){await operator.query('ROLLBACK').catch(()=>{});throw e;}
}
async function syntheticCount(){
 const {rows}=await runtime.query('SELECT count(*)::int AS n FROM public.audit_events WHERE id=ANY($1::uuid[])',[fixtures.map(f=>f.event)]);
 return rows[0].n;
}
try{
 await operator.connect();opConnected=true;
 await runtime.connect();rtConnected=true;
 // FORCE RLS exposes no DELETE policy. The fixture operator must be a disposable
 // PostgreSQL superuser to guarantee cleanup, never the API runtime account.
 const {rows:operators}=await operator.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');
 assert.equal(operators[0]?.rolsuper,true,'Fixture operator must be disposable PostgreSQL superuser for guaranteed cleanup');assertions++;
 const ledger=await operator.query("SELECT filename FROM assettrust_schema_migrations WHERE filename='026_audit_events_rls.sql'");
 assert.equal(ledger.rowCount,1,'apply v0.61 migration first');assertions++;
 const {rows:roles}=await runtime.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user');
 assert.equal(roles[0]?.name,RUNTIME_ROLE);assert.equal(roles[0]?.rolsuper,false);
 assert.equal(roles[0]?.rolbypassrls,false);assert.equal(roles[0]?.rolcreaterole,false);assert.equal(roles[0]?.rolcreatedb,false);assertions+=5;
 const {rows:tbl}=await runtime.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public.audit_events'::regclass");
 assert(tbl[0]?.relrowsecurity&&tbl[0]?.relforcerowsecurity&&tbl[0]?.owner!==RUNTIME_ROLE);assertions++;
 const grants=await runtime.query(`SELECT
   has_table_privilege(current_user,'public.audit_events','SELECT') AS read,
   has_table_privilege(current_user,'public.audit_events','INSERT') AS append,
   has_table_privilege(current_user,'public.audit_events','UPDATE') AS edit,
   has_table_privilege(current_user,'public.audit_events','DELETE') AS remove`);
 assert.deepEqual(grants.rows[0],{read:true,append:true,edit:false,remove:false});assertions++;
 const policy=await operator.query("SELECT policyname,cmd FROM pg_policies WHERE schemaname='public' AND tablename='audit_events'");
 assert.deepEqual(new Set(policy.rows.map(r=>r.cmd)),new Set(['SELECT','INSERT']));assertions++;
 // The operator fixtures are committed so the independent runtime account can see them.
 await seed(fixtures[0],0);await seed(fixtures[1],1);
 assert.equal(await syntheticCount(),0,'no tenant setting must hide both committed audit records');assertions++;
 // Check absent tenant context denies a syntactically valid same-tenant append.
 await runtime.query('BEGIN');
 try{
  await runtime.query('SAVEPOINT no_scope');
  await assert.rejects(()=>runtime.query(`INSERT INTO public.audit_events(id,organization_id,actor_id,action,entity_type,entity_id,previous_hash,event_hash)
    VALUES($1,$2,$3,'NO_SCOPE','test',$4,'GENESIS',$5)`,
    [randomUUID(),fixtures[0].org,fixtures[0].user,fixtures[0].event,'e'.repeat(64)]),
    e=>e?.code==='42501','missing tenant context must deny INSERT');assertions++;
  await runtime.query('ROLLBACK TO SAVEPOINT no_scope');
 }finally{await runtime.query('ROLLBACK');}
 for(let i=0;i<2;i++){
  const own=fixtures[i],other=fixtures[1-i];
  await runtime.query('BEGIN');
  try{
   await runtime.query("SELECT set_config('assettrust.tenant_id',$1,true)",[own.org]);
   assert.equal(await syntheticCount(),1,'own audit event only');assertions++;
   const {rows}=await runtime.query('SELECT id FROM public.audit_events WHERE id=$1',[other.event]);
   assert.equal(rows.length,0,'cross-org event must be invisible');assertions++;
   await runtime.query('SAVEPOINT forbidden_append');
   try{
    await assert.rejects(()=>runtime.query(`INSERT INTO public.audit_events(id,organization_id,actor_id,action,entity_type,entity_id,previous_hash,event_hash)
     VALUES($1,$2,$3,'FORBIDDEN','test',$4,'GENESIS',$5)`,[randomUUID(),other.org,other.user,other.event,'b'.repeat(64)]),
     e=>e?.code==='42501','cross-org append must fail WITH CHECK');assertions++;
   }finally{await runtime.query('ROLLBACK TO SAVEPOINT forbidden_append');await runtime.query('RELEASE SAVEPOINT forbidden_append');}
   // Appending own test row is allowed, then explicitly rolled back.
   await runtime.query(`INSERT INTO public.audit_events(id,organization_id,actor_id,action,entity_type,entity_id,previous_hash,event_hash)
     VALUES($1,$2,$3,'OWN_APPEND','test',$4,'GENESIS',$5)`,[randomUUID(),own.org,own.user,own.event,'c'.repeat(64)]);assertions++;
   await runtime.query('SAVEPOINT forbidden_edit');
   try{
    await assert.rejects(()=>runtime.query('UPDATE public.audit_events SET event_hash=$1 WHERE id=$2',['d'.repeat(64),own.event]),e=>e?.code==='42501','history UPDATE forbidden');assertions++;
   }finally{await runtime.query('ROLLBACK TO SAVEPOINT forbidden_edit');await runtime.query('RELEASE SAVEPOINT forbidden_edit');}
   await runtime.query('SAVEPOINT forbidden_delete');
   try{
    await assert.rejects(()=>runtime.query('DELETE FROM public.audit_events WHERE id=$1',[own.event]),e=>e?.code==='42501','history DELETE forbidden');assertions++;
   }finally{await runtime.query('ROLLBACK TO SAVEPOINT forbidden_delete');await runtime.query('RELEASE SAVEPOINT forbidden_delete');}
  }finally{await runtime.query('ROLLBACK');}
  assert.equal(await syntheticCount(),0,'transaction scope must not leak across requests');assertions++;
 }
 console.log(JSON.stringify({schema:'ASSETTRUST_V61_AUDIT_RLS_LIVE',ok:true,productionApproved:false,
  restrictedRole:RUNTIME_ROLE,organizations:2,assertions,independentConnections:true,
  scope:'append-only audit_events RLS; other unprotected tables NOT covered'}));
}catch(e){console.error('FAIL v0.61 live audit RLS: '+e.message);process.exitCode=1;}
finally{
 if(rtConnected){await runtime.query('ROLLBACK').catch(()=>{});await runtime.end().catch(()=>{});}
 if(opConnected){for(const f of committed.reverse()){
  try{await cleanup(f);}catch(e){console.error('DISPOSABLE FIXTURE CLEANUP FAILED (inspect DB): '+e.message);process.exitCode=1;}
 }await operator.end().catch(()=>{});}
}
