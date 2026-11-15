'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),child=require('node:child_process');
const root=process.env.ASSETTRUST_V77_TEST_ROOT||path.resolve(__dirname,'../..');
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
  if(sql.includes('FROM verification_cases c') && sql.includes('JOIN users actor') && (sql.includes('FOR SHARE OF c,actor')||sql.includes('FOR UPDATE OF c FOR SHARE OF actor')))return {rows:suspended||o.noCaseAccess?[]:[{id:CASE,status:o.caseStatus||'OPEN',asset_id:o.movedCaseAsset||ASSET,role,created_by:o.caseCreator||USER,assigned_to:null}]};
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
  if(sql.includes('SELECT id,asset_id FROM verification_cases WHERE id='))return {rows:o.missingCase?[]:[{id:CASE,asset_id:o.movedCaseAsset||ASSET}]};
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


const disputeReq={caseId:CASE,category:'DOCUMENT',description:'Synthetic registry uncertainty'};
const resolutionReq={status:'RESOLVED',resolution:'Synthetic review conclusion'};
function order(f,...parts){const positions=parts.map(part=>finds(f,part));assert(positions.every(n=>n>=0),`Missing SQL fragment: ${parts.filter((_,i)=>positions[i]<0)}`);assert(positions.every((n,i)=>i===0||n>positions[i-1]),`Unexpected lock ordering: ${positions}`);}

test('dispute creation locks the shared asset before locking its case and inserting',async()=>{
 const f=setup();await f.service.raiseDispute(actor,disputeReq);
 order(f,'TENANT_SCOPE','SELECT c.asset_id','SELECT id FROM assets','FOR UPDATE OF c FOR SHARE OF actor','INSERT INTO disputes','UPDATE assets SET status=');
});
test('dispute resolution locks shared asset before case and dispute row',async()=>{
 const f=setup();await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 order(f,'SELECT case_id FROM disputes','SELECT c.asset_id','SELECT id FROM assets','SELECT id,asset_id FROM verification_cases','SELECT * FROM disputes','UPDATE disputes');
});
test('resolving last case dispute does not unflag asset with another unresolved case',async()=>{
 const f=setup({openDisputes:0,assetOpenDisputes:1});await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 assert(finds(f,"UPDATE verification_cases SET status='OPEN'")>=0);
 assert.equal(finds(f,"UPDATE assets SET status='IN_REVIEW'"),-1);
 assert.equal(f.audits,1);
});
test('asset clears flag only when no remaining disputes across its cases',async()=>{
 const f=setup({openDisputes:0,assetOpenDisputes:0});await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 order(f,'UPDATE disputes','FROM disputes pending',"UPDATE assets SET status='IN_REVIEW'",'AUDIT');
});
test('pending disputes in the same case retain blocked case and flagged asset',async()=>{
 const f=setup({openDisputes:2,assetOpenDisputes:2});await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 assert.equal(finds(f,"UPDATE verification_cases SET status='OPEN'"),-1);
 assert.equal(finds(f,"UPDATE assets SET status='IN_REVIEW'"),-1);
});
test('asset-level pending query joins tenant-scoped verification cases',async()=>{
 const f=setup();await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 const q=f.events.find(e=>e.sql.includes('FROM disputes pending'));
 assert(q);assert.match(q.sql,/JOIN verification_cases c/);
 assert.match(q.sql,/c\.asset_id=\$1/);assert.match(q.sql,/c\.organization_id=\$2/);
 assert.match(q.sql,/pending\.status IN/);assert.deepEqual(Array.from(q.params),[ASSET,ORG]);
});
test('asset state update is additionally scoped to asset and organization',async()=>{
 const f=setup();await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 const q=f.events.find(e=>e.sql.includes("UPDATE assets SET status='IN_REVIEW'"));
 assert(q);assert.match(q.sql,/id=\$1/);assert.match(q.sql,/organization_id=\$2/);
 assert.deepEqual(Array.from(q.params),[ASSET,ORG]);
});
test('creation rejects case reassignment after asset was locked',async()=>{
 const f=setup({movedCaseAsset:'00000000-0000-4000-8000-000000000999'});
 // Locator remains old A in the mock, case lock sees new B.
 await assert.rejects(f.service.raiseDispute(actor,disputeReq),ConflictException);
 noWrite(f);assert.equal(sqls(f).at(-1),'ROLLBACK');
});
test('resolution rejects case reassignment after asset was locked',async()=>{
 const f=setup({movedCaseAsset:'00000000-0000-4000-8000-000000000999'});
 await assert.rejects(f.service.resolveDispute(actor,DISPUTE,resolutionReq),ConflictException);
 noWrite(f);assert.equal(sqls(f).at(-1),'ROLLBACK');
});
test('revoked case participation cannot take asset lock or write dispute',async()=>{
 const f=setup({noCaseAccess:true});await assert.rejects(f.service.raiseDispute(actor,disputeReq));
 noWrite(f);assert.equal(finds(f,'SELECT id FROM assets'),-1);
});
test('suspended user cannot take asset lock or raise dispute',async()=>{
 const f=setup({suspended:true});await assert.rejects(f.service.raiseDispute(actor,disputeReq));
 noWrite(f);assert.equal(finds(f,'SELECT id FROM assets'),-1);
});
test('missing asset fails closed before a dispute mutation',async()=>{
 const f=setup({missingAsset:true});await assert.rejects(f.service.raiseDispute(actor,disputeReq),NotFoundException);noWrite(f);
});
test('dispute resolution rejects suspended admin before any asset lock',async()=>{
 const f=setup({suspended:true});await assert.rejects(f.service.resolveDispute(actor,DISPUTE,resolutionReq),ForbiddenException);
 noWrite(f);assert.equal(finds(f,'SELECT id FROM assets'),-1);
});
test('dispute resolution rejects downgraded admin before any asset lock',async()=>{
 const f=setup({role:'REVIEWER'});await assert.rejects(f.service.resolveDispute(actor,DISPUTE,resolutionReq),ForbiddenException);
 noWrite(f);assert.equal(finds(f,'SELECT id FROM assets'),-1);
});
test('closed cases never create new disputes even after asset is locked',async()=>{
 const f=setup({caseStatus:'CLOSED'});await assert.rejects(f.service.raiseDispute(actor,disputeReq),ConflictException);noWrite(f);
});
test('first authorization query includes active user and current case relationship',async()=>{
 const f=setup();await f.service.raiseDispute(actor,disputeReq);
 const q=f.events.find(e=>e.sql.includes('SELECT c.asset_id'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);
 assert.match(q.sql,/c\.organization_id=\$2/);
 assert.match(q.sql,/actor\.role='ORG_ADMIN'/);
 assert.match(q.sql,/c\.created_by=actor\.id/);
 assert.deepEqual(Array.from(q.params),[CASE,ORG,USER]);
});
test('case authorization is checked again after obtaining the asset lock',async()=>{
 const f=setup();await f.service.raiseDispute(actor,disputeReq);
 order(f,'SELECT c.asset_id','SELECT id FROM assets','FOR UPDATE OF c FOR SHARE OF actor','INSERT INTO disputes');
});
test('an already resolved dispute is not written twice',async()=>{
 const f=setup({disputeStatus:'RESOLVED'});await assert.rejects(f.service.resolveDispute(actor,DISPUTE,resolutionReq),ConflictException);noWrite(f);
});
test('a missing dispute is rejected before asset locking',async()=>{
 const f=setup({missingDispute:true});await assert.rejects(f.service.resolveDispute(actor,DISPUTE,resolutionReq),NotFoundException);noWrite(f);
 assert.equal(finds(f,'SELECT id FROM assets'),-1);
});
test('database failure during asset lock rolls back without writes',async()=>{
 const f=setup({missingAsset:true});await assert.rejects(f.service.resolveDispute(actor,DISPUTE,resolutionReq),NotFoundException);
 noWrite(f);assert.equal(sqls(f).at(-1),'ROLLBACK');
});
test('all mutations retain audit after status updates',async()=>{
 const f=setup();await f.service.resolveDispute(actor,DISPUTE,resolutionReq);
 order(f,'UPDATE disputes','FROM disputes pending','AUDIT','COMMIT');
});
test('creation only notifies and flags after permission checks',async()=>{
 const f=setup();await f.service.raiseDispute(actor,disputeReq);
 order(f,'SELECT c.asset_id','SELECT id FROM assets','FOR UPDATE OF c FOR SHARE OF actor','INSERT INTO disputes','UPDATE assets SET status=','AUDIT');
});
