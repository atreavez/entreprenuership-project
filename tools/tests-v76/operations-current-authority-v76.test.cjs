'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),child=require('node:child_process');
const root=process.env.ASSETTRUST_V76_TEST_ROOT||path.resolve(__dirname,'../..');
const ts=(()=>{try{return require('typescript')}catch{return require(path.join(child.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();
function load(file,imports){
 const src=fs.readFileSync(path.join(root,file),'utf8');
 const js=ts.transpileModule(src,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{if(!(id in imports))throw new Error('Unstubbed import '+id+' in '+file);return imports[id]},process,Date,Promise,Error,Buffer,console},{timeout:4000,filename:file});
 return mod.exports;
}
class ForbiddenException extends Error{} class NotFoundException extends Error{} class ConflictException extends Error{} class BadRequestException extends Error{}
let OperationsService;
const dec=()=>()=>{};
const nest={Controller:dec,Get:dec,Post:dec,Patch:dec,Param:dec,Body:dec,Req:dec,UseGuards:dec,Module:dec,
 Injectable:()=>target=>{if(target.name==='OperationsService')OperationsService=target;},
 ForbiddenException,NotFoundException,ConflictException,BadRequestException};
const guards=load('apps/api/src/contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
const ORG='00000000-0000-4000-8000-000000000201',USER='00000000-0000-4000-8000-000000000202',CASE='00000000-0000-4000-8000-000000000203',ASSET='00000000-0000-4000-8000-000000000204',TASK='00000000-0000-4000-8000-000000000205',DISPUTE='00000000-0000-4000-8000-000000000206',QUOTE='00000000-0000-4000-8000-000000000207',ASSIGNEE='00000000-0000-4000-8000-000000000208';
const actor={id:USER,organizationId:ORG,role:'ORG_ADMIN'};
const common={uid:()=> '00000000-0000-4000-8000-000000000209',isUuid:value=>value,text:value=>value,optionalText:value=>value??null,enumValue:(value,values)=>{if(!values.includes(value))throw new BadRequestException();return value},assertRole:(u,roles)=>{if(!roles.includes(u.role))throw new ForbiddenException()}};
const scope={setTenantScope:async(tx,org)=>tx.query('TENANT_SCOPE',[org])};
load('apps/api/src/operations.ts',{'@nestjs/common':nest,'./database':{Database:class{}},'./audit':{AuditService:class{},AuditModule:class{}},'./auth':{AuthModule:class{},AuthGuard:class{}},'./access':{AccessModule:class{},AccessService:class{}},'./common':common,'./contexts/tenant-isolation/application/tenant-scope':scope,'./contexts/access/infrastructure/transactional-access':guards});
assert(OperationsService,'Expected to capture decorated actual OperationsService class');
function setup(o={}){
 const events=[];let writes=0,audits=0;
 const role=o.role||'ORG_ADMIN',suspended=!!o.suspended;
 const query=async(sql,params=[])=>{
  events.push({sql,params});
  if(sql==='TENANT_SCOPE')return {rows:[]};
  if(sql.includes('SELECT id,role FROM users'))return {rows:suspended?[]:[{id:USER,role}]};
  if(sql.includes('FROM verification_cases c') && sql.includes('JOIN users actor') && (sql.includes('FOR SHARE OF c,actor')||sql.includes('FOR UPDATE OF c FOR SHARE OF actor')))return {rows:suspended||o.noCaseAccess?[]:[{id:CASE,status:o.caseStatus||'OPEN',asset_id:ASSET,role,created_by:o.caseCreator||USER,assigned_to:null}]};
  if(sql.includes('FROM assets a JOIN users actor') && sql.includes('FOR SHARE OF a,actor'))return {rows:suspended||o.noAssetAccess?[]:[{id:ASSET,role,created_by:o.assetCreator||USER}]};
  if(sql.includes('FROM resource_grants g'))return {rows:o.grant?[{id:'grant'}]:[]};
  if(sql.includes('FROM verification_cases c') && sql.includes('LIMIT 1 FOR SHARE'))return {rows:o.caseGrant?[{id:CASE}]:[]};
  if(sql.includes('SELECT id FROM users WHERE id='))return {rows:o.noAssignee?[]:[{id:ASSIGNEE}]};
  if(sql.includes('FROM case_tasks t') && sql.includes('FOR UPDATE OF t FOR SHARE OF actor'))return {rows:suspended||o.missingTask?[]:[{id:TASK,created_by:o.taskCreator??USER,assignee_id:o.taskAssignee??USER,status:'TODO',current_actor_role:role}]};
  if(sql.includes('SELECT c.asset_id') && sql.includes('FROM verification_cases c JOIN users actor'))return {rows:suspended||o.noCaseAccess?[]:[{asset_id:ASSET}]};
  if(sql.includes('SELECT id FROM assets') && sql.includes('FOR UPDATE'))return {rows:o.missingAsset?[]:[{id:ASSET}]};
  if(sql.includes('FROM disputes pending') && sql.includes('count(*)'))return {rows:[{n:o.assetOpenDisputes??o.openDisputes??0}]};
  if(sql.includes('SELECT id,status FROM verification_cases'))return {rows:o.missingCase?[]:[{id:CASE,status:o.caseStatus||'OPEN'}]};
  if(sql.includes('SELECT case_id FROM disputes'))return {rows:o.missingDispute?[]:[{case_id:CASE}]};
  if(sql.includes('SELECT id,asset_id FROM verification_cases WHERE id='))return {rows:o.missingCase?[]:[{id:CASE,asset_id:ASSET}]};
  if(sql.includes('SELECT * FROM disputes'))return {rows:o.missingDispute?[]:[{id:DISPUTE,status:o.disputeStatus||'OPEN',case_id:CASE}]};
  if(sql.includes('FROM disputes WHERE case_id=') && sql.includes('count(*)'))return {rows:[{n:o.openDisputes??0}]};
  if(sql.includes('SELECT id FROM users WHERE organization_id='))return {rows:[]};
  if(sql.includes('SELECT * FROM verification_quotes'))return {rows:o.missingQuote?[]:[{id:QUOTE,status:o.quoteStatus||'DRAFT'}]};
  if(sql.startsWith('INSERT ')||sql.startsWith('UPDATE ')) {writes++;return {rows:[],rowCount:1};}
  if(sql.includes('FROM case_tasks t')||sql.includes('FROM disputes d')||sql.includes('FROM monitoring_reminders m')||sql.includes('FROM verification_quotes q'))return {rows:suspended?[]:[{id:TASK}]};
  throw Error('Unexpected SQL: '+sql);
 };
 const tx={query};
 const db={transaction:async fn=>{events.push({sql:'BEGIN'});try{let v=await fn(tx);events.push({sql:'COMMIT'});return v;}catch(e){events.push({sql:'ROLLBACK'});throw e;}},tenantQuery:async(org,sql,params=[])=>query(sql,params)};
 const audit={write:async()=>{audits++;events.push({sql:'AUDIT'})}};
 const access={case:async()=>{events.push({sql:'LEGACY_CASE_PREFLIGHT'})},asset:async()=>{events.push({sql:'LEGACY_ASSET_PREFLIGHT'})},orgUser:async()=>{events.push({sql:'LEGACY_USER_PREFLIGHT'})}};
 return {service:new OperationsService(db,audit,access),events,get writes(){return writes},get audits(){return audits}};
}
const sqls=f=>f.events.map(e=>e.sql);
const finds=(f,fragment)=>sqls(f).findIndex(x=>x.includes(fragment));
const noWrite=f=>{assert.equal(f.writes,0);assert.equal(f.audits,0);};
const r=u=>({...actor,role:u});

test('quote list checks active current role and case membership in one SQL statement',async()=>{
 const f=setup();await f.service.quotes(actor);const q=f.events.find(e=>e.sql.includes('FROM verification_quotes q'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);assert.match(q.sql,/actor\.role IN \('ORG_ADMIN','REVIEWER'\)/);assert.match(q.sql,/c\.organization_id=q\.organization_id/);
 assert.match(q.sql,/c\.created_by=actor\.id/);assert.deepEqual(Array.from(q.params),[ORG,USER]);
});
test('quote list refuses suspended user',async()=>{const f=setup({suspended:true});assert.equal((await f.service.quotes(actor)).length,0)});
for(const operation of ['createQuote','updateQuote','resolveDispute'])for(const condition of ['downgraded','suspended']){
 test(`${operation} rejects ${condition} token-privileged administrator before mutations`,async()=>{
  const f=setup(condition==='downgraded'?{role:'REVIEWER'}:{suspended:true});
  const req=operation==='createQuote'?[actor,{caseId:CASE,amountUgx:120000,scope:'Review'}]:operation==='updateQuote'?[actor,QUOTE,{status:'ISSUED'}]:[actor,DISPUTE,{status:'RESOLVED',resolution:'Verified registry match'}];
  await assert.rejects(f.service[operation](...req),ForbiddenException);noWrite(f);assert.equal(sqls(f).at(-1),'ROLLBACK');
 });
}
test('quote create locks current admin then case before insertion and audit',async()=>{
 const f=setup();await f.service.createQuote(actor,{caseId:CASE,amountUgx:25000,scope:'Verification'});
 assert(finds(f,'SELECT id,role FROM users')>finds(f,'TENANT_SCOPE'));
 assert(finds(f,'FOR SHARE OF c,actor')>finds(f,'SELECT id,role FROM users'));
 assert(finds(f,'INSERT INTO verification_quotes')>finds(f,'FOR SHARE OF c,actor'));
 assert.equal(f.writes,1);assert.equal(f.audits,1);
});
test('quote create refuses current case access failure without writes',async()=>{
 const f=setup({noCaseAccess:true});await assert.rejects(f.service.createQuote(actor,{caseId:CASE,amountUgx:25000,scope:'Review'}));noWrite(f);
});
test('quote update permits one valid transition only after current-role lock',async()=>{
 const f=setup();await f.service.updateQuote(actor,QUOTE,{status:'ISSUED'});
 assert(finds(f,'SELECT id,role FROM users')<finds(f,'SELECT * FROM verification_quotes'));
 assert(finds(f,'SELECT * FROM verification_quotes')<finds(f,'UPDATE verification_quotes'));
 assert.equal(f.audits,1);
});
test('quote update refuses invalid transition even for live admin',async()=>{
 const f=setup({quoteStatus:'ISSUED'});await assert.rejects(f.service.updateQuote(actor,QUOTE,{status:'ACCEPTED'}),ConflictException);noWrite(f);
});
test('dispute resolution locks parent case before dispute row, prior to any writes',async()=>{
 const f=setup();await f.service.resolveDispute(actor,DISPUTE,{status:'RESOLVED',resolution:'Verified evidence records'});
 assert(finds(f,'SELECT case_id FROM disputes')<finds(f,'SELECT id,asset_id FROM verification_cases'));
 assert(finds(f,'SELECT id,asset_id FROM verification_cases')<finds(f,'SELECT * FROM disputes'));
 assert(finds(f,'SELECT * FROM disputes')<finds(f,'UPDATE disputes'));
 assert.equal(f.audits,1);
});
test('dispute finalization maintains BLOCKED when unresolved disputes remain',async()=>{
 const f=setup({openDisputes:1});await f.service.resolveDispute(actor,DISPUTE,{status:'RESOLVED',resolution:'Resolved documentation'});
 assert.equal(finds(f,"UPDATE verification_cases SET status='OPEN'"),-1);assert.equal(f.audits,1);
});
test('dispute finalization reopens once the parent case has no unresolved disputes',async()=>{
 const f=setup({openDisputes:0});await f.service.resolveDispute(actor,DISPUTE,{status:'RESOLVED',resolution:'Resolved documentation'});
 assert(finds(f,"UPDATE verification_cases SET status='OPEN'")>finds(f,'FROM disputes WHERE case_id='));
});
test('raising dispute rejects closed case before inserting or flagging the asset',async()=>{
 const f=setup({caseStatus:'CLOSED'});await assert.rejects(f.service.raiseDispute(actor,{caseId:CASE,category:'DOCUMENT',description:'Missing registry'}),ConflictException);noWrite(f);
});
test('raising dispute revalidates case participation before locking and writing',async()=>{
 const f=setup({noCaseAccess:true});await assert.rejects(f.service.raiseDispute(actor,{caseId:CASE,category:'DOCUMENT',description:'Missing registry'}));noWrite(f);
});
test('raising dispute writes only after participant and case-status locks',async()=>{
 const f=setup();await f.service.raiseDispute(actor,{caseId:CASE,category:'DOCUMENT',description:'Missing registry'});
 assert(finds(f,'FOR UPDATE OF c FOR SHARE OF actor')>finds(f,'TENANT_SCOPE'));
 assert(finds(f,'FOR UPDATE OF c FOR SHARE OF actor')<finds(f,'INSERT INTO disputes'));
 assert.equal(finds(f,'SELECT id,status FROM verification_cases'),-1);
 assert.equal(f.audits,1);
});
test('task create checks current role and case before insert',async()=>{
 const f=setup();await f.service.createTask(actor,{caseId:CASE,title:'Inspect documents'});
 assert(finds(f,'SELECT id,role FROM users')<finds(f,'FOR SHARE OF c,actor'));
 assert(finds(f,'FOR SHARE OF c,actor')<finds(f,'INSERT INTO case_tasks'));
 assert.equal(f.audits,1);
});
for(const opts of [{role:'CLIENT'},{suspended:true},{noCaseAccess:true}])test('task create rejects revoked privilege '+JSON.stringify(opts),async()=>{
 const f=setup(opts);await assert.rejects(f.service.createTask(actor,{caseId:CASE,title:'Inspect'}));noWrite(f);
});
test('task create refuses inactive assignee before notification or task insert',async()=>{
 const f=setup({noAssignee:true});await assert.rejects(f.service.createTask(actor,{caseId:CASE,title:'Inspect',assigneeId:ASSIGNEE}),BadRequestException);noWrite(f);
});
test('task update rechecks live user and task ownership under row lock',async()=>{
 const f=setup();await f.service.updateTask(actor,TASK,{status:'DONE'});
 const q=f.events.find(e=>e.sql.includes('FROM case_tasks t')&&e.sql.includes('FOR UPDATE OF t'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);assert.equal(f.audits,1);
});
test('demoted task administrator without assignment cannot update somebody else task',async()=>{
 const f=setup({role:'REVIEWER',taskCreator:ASSIGNEE,taskAssignee:ASSIGNEE});await assert.rejects(f.service.updateTask(actor,TASK,{status:'DONE'}),ForbiddenException);noWrite(f);
});
test('suspended task member cannot update assigned task',async()=>{
 const f=setup({suspended:true});await assert.rejects(f.service.updateTask(actor,TASK,{status:'DONE'}),NotFoundException);noWrite(f);
});
test('assigned non-admin with current membership retains own task update access',async()=>{
 const f=setup({role:'REVIEWER',taskCreator:ASSIGNEE,taskAssignee:USER});await f.service.updateTask(r('REVIEWER'),TASK,{status:'DONE'});assert.equal(f.audits,1);
});
test('reminder create holds current asset read authorization until insertion',async()=>{
 const f=setup();await f.service.createReminder(actor,{assetId:ASSET,label:'Renew search',dueAt:'2099-01-01'});
 assert(finds(f,'FOR SHARE OF a,actor')<finds(f,'INSERT INTO monitoring_reminders'));assert.equal(f.audits,1);
});
test('reminder create denies suspended member with stale granted asset access',async()=>{
 const f=setup({suspended:true});await assert.rejects(f.service.createReminder(actor,{assetId:ASSET,label:'Renew search',dueAt:'2099-01-01'}));noWrite(f);
});
test('task list is tenant-scoped and uses current active role',async()=>{
 const f=setup();await f.service.tasks(actor);const q=f.events.find(e=>e.sql.includes('FROM case_tasks t')&&!e.sql.includes('FOR UPDATE'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);assert.match(q.sql,/actor\.role='ORG_ADMIN'/);assert(!q.sql.includes('$4::bool'));
});
test('case-scoped task list uses same-transaction current case permission',async()=>{
 const f=setup();await f.service.tasks(actor,CASE);assert(finds(f,'FOR SHARE OF c,actor')<finds(f,'FROM case_tasks t'));
});
for(const fn of ['disputes','reminders'])test(`${fn} list uses current active actor rather than stale token admin boolean`,async()=>{
 const f=setup();await f.service[fn](actor);
 const q=f.events.find(e=>e.sql.includes(fn==='disputes'?'FROM disputes d':'FROM monitoring_reminders m'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);assert.match(q.sql,/actor\.role='ORG_ADMIN'/);assert(!q.sql.includes('$3::bool'));
});
