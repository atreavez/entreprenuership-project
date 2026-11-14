/**
 * v0.62: LIVE, guarded two-org + same-org recipient RLS and composite FK contract.
 * Disposable test DB ONLY. Requires restricted API DB login, not an operator login.
 * No network/database access occurs before guard validation.
 * Fixture cleanup is best-effort after interruption; inspect DB if cleanup fails.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
const env=process.env;
if(env.CI!=='true'||env.NODE_ENV!=='test'||env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||
 env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES'||env.ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM!=='YES')
 throw Error('BLOCKED: disposable CI, restricted runtime, and explicit operational RLS fixture consent required');
const target=validateDisposablePgTarget(env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('BLOCKED: unexpected test database');
validateRuntimeDatabaseUrls(env.DATABASE_URL,env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const operator=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v62-fixture-operator'});
const runtime=new pg.Client({connectionString:env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v62-restricted-runtime'});
const makeUser=()=>({id:randomUUID(),email:`v62-${randomUUID()}@example.invalid`});
const fixtures=[0,1].map(i=>({org:randomUUID(),users:i===0?[makeUser(),makeUser()]:[makeUser()],asset:randomUUID(),case:randomUUID(),
 task:randomUUID(),dispute:randomUUID(),reminder:randomUUID(),quote:randomUUID(),inboxes:(i===0?[randomUUID(),randomUUID()]:[randomUUID()])}));
const tables=['case_tasks','disputes','monitoring_reminders','verification_quotes'];
let opConnected=false,rtConnected=false,assertions=0;const committed=[];
async function withTransaction(db,fn){await db.query('BEGIN');try{const result=await fn();await db.query('COMMIT');return result}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}}
async function setScope(org,actor){await runtime.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);if(actor)await runtime.query("SELECT set_config('assettrust.actor_id',$1,true)",[actor]);}
async function queryVisible(table,ids){const r=await runtime.query(`SELECT id FROM public.${table} WHERE id=ANY($1::uuid[])`,[ids]);return r.rows.map(x=>x.id).sort();}
async function seed(f,i){await withTransaction(operator,async()=>{
 await operator.query('INSERT INTO public.organizations(id,name) VALUES($1,$2)',[f.org,`v62 disposable org ${i}`]);
 for(const u of f.users)await operator.query(`INSERT INTO public.users(id,organization_id,full_name,email,password_hash,role)
 VALUES($1,$2,'Synthetic Security Test',$3,'NOT_A_REAL_PASSWORD','ORG_ADMIN')`,[u.id,f.org,u.email]);
 await operator.query(`INSERT INTO public.assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
 VALUES($1,$2,$3,'LAND','Synthetic District','Synthetic Owner',$4)`,[f.asset,f.org,`V62-${f.asset}`.slice(0,48),f.users[0].id]);
 await operator.query(`INSERT INTO public.verification_cases(id,organization_id,case_code,asset_id,created_by)
 VALUES($1,$2,$3,$4,$5)`,[f.case,f.org,`V62-${f.case}`.slice(0,48),f.asset,f.users[0].id]);
 await operator.query(`INSERT INTO public.case_tasks(id,organization_id,case_id,title,created_by)
 VALUES($1,$2,$3,'v62 task fixture',$4)`,[f.task,f.org,f.case,f.users[0].id]);
 await operator.query(`INSERT INTO public.disputes(id,organization_id,case_id,category,description,reported_by)
 VALUES($1,$2,$3,'OTHER','v62 fixture only',$4)`,[f.dispute,f.org,f.case,f.users[0].id]);
 await operator.query(`INSERT INTO public.monitoring_reminders(id,organization_id,asset_id,label,due_at,created_by)
 VALUES($1,$2,$3,'v62 reminder',now()+interval '1 day',$4)`,[f.reminder,f.org,f.asset,f.users[0].id]);
 await operator.query(`INSERT INTO public.verification_quotes(id,organization_id,case_id,amount_ugx,scope,created_by)
 VALUES($1,$2,$3,0,'v62 free fixture',$4)`,[f.quote,f.org,f.case,f.users[0].id]);
 for(let j=0;j<f.inboxes.length;j++)await operator.query(`INSERT INTO public.notifications(id,organization_id,recipient_id,category,title)
 VALUES($1,$2,$3,'TEST','Synthetic v62 notification')`,[f.inboxes[j],f.org,f.users[j].id]);
 });committed.push(f);}
async function cleanup(f){await withTransaction(operator,async()=>{
 for(const [table,ids] of [['notifications',f.inboxes],['case_tasks',[f.task]],['disputes',[f.dispute]],['monitoring_reminders',[f.reminder]],['verification_quotes',[f.quote]]])
   await operator.query(`DELETE FROM public.${table} WHERE id=ANY($1::uuid[]) AND organization_id=$2`,[ids,f.org]);
 await operator.query('DELETE FROM public.verification_cases WHERE id=$1 AND organization_id=$2',[f.case,f.org]);
 await operator.query('DELETE FROM public.assets WHERE id=$1 AND organization_id=$2',[f.asset,f.org]);
 await operator.query('DELETE FROM public.users WHERE id=ANY($1::uuid[]) AND organization_id=$2',[f.users.map(x=>x.id),f.org]);
 await operator.query('DELETE FROM public.organizations WHERE id=$1',[f.org]);
 });}
function ids(table){return fixtures.map(f=>({case_tasks:f.task,disputes:f.dispute,monitoring_reminders:f.reminder,verification_quotes:f.quote,notifications:f.inboxes[0]})[table]);}
try{
 await operator.connect();opConnected=true;await runtime.connect();rtConnected=true;
 const {rows:opRole}=await operator.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');
 assert.equal(opRole[0]?.rolsuper,true,'Disposable fixture operator must be superuser for cleanup');assertions++;
 const applied=await operator.query("SELECT filename FROM public.assettrust_schema_migrations WHERE filename='027_operational_data_rls.sql'");
 assert.equal(applied.rowCount,1,'Apply v0.62 migration before running fixtures');assertions++;
 const {rows:rtRole}=await runtime.query('SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user');
 assert.equal(rtRole[0]?.rolname,RUNTIME_ROLE);assert(!rtRole[0]?.rolsuper&&!rtRole[0]?.rolbypassrls&&!rtRole[0]?.rolcreaterole&&!rtRole[0]?.rolcreatedb);assertions+=2;
 for(const table of [...tables,'notifications']){
  const {rows}=await runtime.query('SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=$1::regclass',[`public.${table}`]);
  assert(rows[0]?.relrowsecurity&&rows[0]?.relforcerowsecurity&&rows[0]?.owner!==RUNTIME_ROLE,table+' FORCE RLS missing');assertions++;
 }
 const inboxPolicies=await operator.query("SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='notifications'");
 assert.deepEqual(new Set(inboxPolicies.rows.map(r=>r.cmd)),new Set(['SELECT','UPDATE','INSERT']));assertions++;
 await seed(fixtures[0],0);await seed(fixtures[1],1);
 // Even a privileged fixture account cannot create cross-organization relationships:
 // composite FKs must reject the wrong parent tenant independently of RLS.
 await operator.query('BEGIN');
 try{
  const a=fixtures[0],b=fixtures[1];
  const crossLinks=[
   ['case_tasks',`INSERT INTO public.case_tasks(id,organization_id,case_id,title,created_by) VALUES($1,$2,$3,'cross org rejected',$4)`,[randomUUID(),a.org,b.case,a.users[0].id]],
   ['disputes',`INSERT INTO public.disputes(id,organization_id,case_id,category,description,reported_by) VALUES($1,$2,$3,'OTHER','cross org rejected',$4)`,[randomUUID(),a.org,b.case,a.users[0].id]],
   ['monitoring_reminders',`INSERT INTO public.monitoring_reminders(id,organization_id,asset_id,label,due_at,created_by) VALUES($1,$2,$3,'cross org rejected',now()+interval '1 day',$4)`,[randomUUID(),a.org,b.asset,a.users[0].id]],
   ['verification_quotes',`INSERT INTO public.verification_quotes(id,organization_id,case_id,amount_ugx,scope,created_by) VALUES($1,$2,$3,0,'cross org rejected',$4)`,[randomUUID(),a.org,b.case,a.users[0].id]],
   ['notifications',`INSERT INTO public.notifications(id,organization_id,recipient_id,category,title) VALUES($1,$2,$3,'TEST','cross org rejected')`,[randomUUID(),a.org,b.users[0].id]],
  ];
  for(const [table,sql,params] of crossLinks){
   await operator.query('SAVEPOINT relation_scope');
   try{await assert.rejects(()=>operator.query(sql,params),e=>e?.code==='23503',table+' composite organization FK must reject cross-org linkage');assertions++;}
   finally{await operator.query('ROLLBACK TO SAVEPOINT relation_scope');await operator.query('RELEASE SAVEPOINT relation_scope');}
  }
 }finally{await operator.query('ROLLBACK');}
 // No actor in this transaction: even a correctly scoped tenant cannot read inboxes.
 await runtime.query('BEGIN');
 try{
  await runtime.query("SELECT set_config('assettrust.tenant_id',$1,true)",[fixtures[0].org]);
  assert.deepEqual(await queryVisible('notifications',fixtures[0].inboxes),[],'missing authenticated actor must fail closed');assertions++;
 }finally{await runtime.query('ROLLBACK');}
 for(const table of [...tables,'notifications']){
  assert.deepEqual(await queryVisible(table,ids(table)),[],table+' must hide all without tenant');assertions++;
 }
 for(let i=0;i<2;i++){
  const f=fixtures[i],other=fixtures[1-i];
  await runtime.query('BEGIN');try{
   await setScope(f.org,f.users[0].id);
   for(const table of tables){
    assert.deepEqual(await queryVisible(table,ids(table)),[({case_tasks:f.task,disputes:f.dispute,monitoring_reminders:f.reminder,verification_quotes:f.quote})[table]],table);assertions++;
    const cross=await runtime.query(`UPDATE public.${table} SET organization_id=organization_id WHERE id=$1 RETURNING id`,[({case_tasks:other.task,disputes:other.dispute,monitoring_reminders:other.reminder,verification_quotes:other.quote})[table]]);
    assert.equal(cross.rowCount,0,table+' cross-tenant UPDATE must see no row');assertions++;
    const gone=await runtime.query(`DELETE FROM public.${table} WHERE id=$1 RETURNING id`,[({case_tasks:other.task,disputes:other.dispute,monitoring_reminders:other.reminder,verification_quotes:other.quote})[table]]);
    assert.equal(gone.rowCount,0,table+' cross-tenant DELETE must see no row');assertions++;
   }
   assert.deepEqual(await queryVisible('notifications',[...fixtures[0].inboxes,...fixtures[1].inboxes]),[f.inboxes[0]],'only addressed inbox should be visible');assertions++;
   if(f.users.length>1){
    const otherRecipient=await runtime.query('UPDATE public.notifications SET read_at=now() WHERE id=$1 RETURNING id',[f.inboxes[1]]);
    assert.equal(otherRecipient.rowCount,0,'same-org different recipient must not be modified');assertions++;
   }
   const own=await runtime.query('UPDATE public.notifications SET read_at=now() WHERE id=$1 RETURNING id',[f.inboxes[0]]);
   assert.equal(own.rowCount,1,'own inbox update must succeed');assertions++;
   const crossInbox=await runtime.query('UPDATE public.notifications SET read_at=now() WHERE id=$1 RETURNING id',[other.inboxes[0]]);
   assert.equal(crossInbox.rowCount,0,'cross-org inbox update must be invisible');assertions++;
   const newId=randomUUID();await runtime.query('INSERT INTO public.notifications(id,organization_id,recipient_id,category,title) VALUES($1,$2,$3,$4,$5)',[newId,f.org,f.users[0].id,'TEST','Own insert']);assertions++;
   await runtime.query('SAVEPOINT cross_insert');
   try{await assert.rejects(()=>runtime.query('INSERT INTO public.notifications(id,organization_id,recipient_id,category,title) VALUES($1,$2,$3,$4,$5)',[randomUUID(),other.org,other.users[0].id,'TEST','Cross insert']),e=>e?.code==='42501');assertions++;}
   finally{await runtime.query('ROLLBACK TO SAVEPOINT cross_insert');await runtime.query('RELEASE SAVEPOINT cross_insert');}
  }finally{await runtime.query('ROLLBACK');}
  for(const table of [...tables,'notifications']){
   assert.deepEqual(await queryVisible(table,ids(table)),[],table+' tenant context leaked outside transaction');assertions++;
  }
 }
 // Same tenant, different authenticated recipient must not see sibling's notification.
 const first=fixtures[0];await runtime.query('BEGIN');try{
  await setScope(first.org,first.users[1].id);
  assert.deepEqual(await queryVisible('notifications',first.inboxes),[first.inboxes[1]],'sibling must see only their own notification');assertions++;
 }finally{await runtime.query('ROLLBACK');}
 console.log(JSON.stringify({schema:'ASSETTRUST_V62_OPERATIONAL_RLS_LIVE',ok:true,productionApproved:false,organizations:2,
  siblingRecipients:2,tables:[...tables,'notifications'],assertions,independentConnections:true}));
}catch(e){console.error('FAIL v0.62 operational RLS: '+e.message);process.exitCode=1;}
finally{
 if(rtConnected){await runtime.query('ROLLBACK').catch(()=>{});await runtime.end().catch(()=>{});}
 if(opConnected){for(const f of committed.reverse()){
  try{await cleanup(f);}catch(e){console.error('DISPOSABLE FIXTURE CLEANUP FAILED; inspect DB: '+e.message);process.exitCode=1;}
 }await operator.end().catch(()=>{});}
}
