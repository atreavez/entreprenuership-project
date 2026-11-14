'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const ts=(()=>{try{return require('typescript')}catch{return require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();
const ids={org:'33333333-3333-4333-8333-333333333333',actor:'44444444-4444-4444-8444-444444444444',case:'55555555-5555-4555-8555-555555555555'};
const actor=(role='ORG_ADMIN')=>({id:ids.actor,organizationId:ids.org,role});
class ForbiddenException extends Error {}
class NotFoundException extends Error {}
const common={'@nestjs/common':{Injectable:()=>()=>{},Controller:()=>()=>{},Get:()=>()=>{},Param:()=>()=>{},Req:()=>()=>{},UseGuards:()=>()=>{},Module:()=>()=>{},ForbiddenException,NotFoundException}};
function load(rel,stubs={}){
 const file=path.join(ROOT,rel),code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 const mod={exports:{}};
 const map={...common,...stubs};
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>{if(n==='node:crypto')return crypto;if(Object.hasOwn(map,n))return map[n];throw Error('Unreviewed test dependency '+n+' in '+rel);},Date,JSON,Object,Array,Error,Promise,Buffer,console},{filename:file,timeout:5000});
 return mod.exports;
}
const scope={setTenantScope:async(tx,org)=>{await tx.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);}};
const acl=load('apps/api/src/contexts/access/infrastructure/transactional-access.ts');
const read=load('apps/api/src/contexts/access/infrastructure/current-read-authority.ts');
const accessStub={'./contexts/tenant-isolation/application/tenant-scope':scope,'./contexts/access/infrastructure/transactional-access':acl};
const dashboard=load('apps/api/src/dashboard.ts',{
 ...accessStub,
 './contexts/access/infrastructure/current-read-authority':read,
 './database':{Database:class{}},'./auth':{AuthGuard:class{},AuthModule:class{}},
 './common':{isUuid:s=>s},'./access':{AccessModule:class{},AccessService:class{}},
 './contexts/content-publishing/infrastructure/published-content.module':{PublishedContentModule:class{},PublishedContentService:class{}},
 './contexts/content-publishing/domain/publication-policy':{attachDraftPublication:(r,copy)=>({...r,publication:copy})}
});
const audit=load('apps/api/src/audit.ts',{
 ...accessStub,'./database':{Database:class{}},'./common':{uid:crypto.randomUUID,hash:s=>crypto.createHash('sha256').update(s).digest('hex')},'./auth':{AuthGuard:class{},AuthModule:class{}}
});
const integrations=load('apps/api/src/integrations.ts',{
 ...accessStub,'./database':{Database:class{}},'./auth':{AuthGuard:class{},AuthModule:class{}},'./common':{}
});
function fixture({role='ORG_ADMIN',suspended=false,canCase=true,caseId=ids.case,rows=[]}={}){
 const events=[];let active=false,commits=0;
 const db={
  query:()=>{throw Error('unscoped query forbidden')},
  tenantQuery:()=>{throw Error('independent scoped reads forbidden')},
  transaction:async(fn)=>{assert(!active);active=true;events.push(['BEGIN']);try{const result=await fn({query:async(sql,params=[])=>{
   assert(active,'query must be inside transaction');events.push([sql,params]);
   if(sql.includes("set_config('assettrust.tenant_id'"))return {rows:[]};
   if(sql.includes('FROM users')&&sql.includes('suspended_at IS NULL'))return {rows:suspended?[]:[{id:ids.actor,role}]};
   if(sql.includes('FROM verification_cases c JOIN users actor')||sql.includes('FROM verification_cases c\n')){
    if(sql.includes('FOR SHARE OF c,actor'))return {rows:canCase&&!suspended?[{id:caseId,role,created_by:ids.actor,assigned_to:null}]:[]};
   }
   if(sql.includes('SELECT c.*,a.asset_code'))return {rows:[{id:caseId,case_code:'CASE-X',asset_code:'AS-X',organization_name:'Example'}]};
   if(sql.includes('FROM case_evidence'))return {rows:[{stage:'DOCUMENT_REVIEW',evidence_type:'MANUAL'}]};
   if(sql.includes('FROM audit_events'))return {rows};
   if(sql.includes('FROM assets a WHERE')||sql.includes('FROM verification_cases c')||sql.includes('FROM documents d'))return {rows:[{total:2}]};
   if(sql.includes('FROM admin_content_templates'))return {rows:[]};
   return {rows:[]};
  }});commits++;events.push(['COMMIT']);return result;}catch(e){events.push(['ROLLBACK']);throw e;}finally{active=false;}}
 };
 return {db,events,get commits(){return commits;},get active(){return active;}};
}
const statements=f=>f.events.map(e=>e[0]);
const find=(f,text)=>statements(f).findIndex(x=>x.includes(text));

test('current read helper uses active DB role, not stale JWT role',async()=>{
 const f=fixture({role:'REVIEWER'});
 const result=await f.db.transaction(async tx=>read.currentReadAuthority(tx,actor('ORG_ADMIN')));
 assert.equal(result.role,'REVIEWER');assert.equal(result.administrator,false);
 assert.match(statements(f)[1],/suspended_at IS NULL/);assert.match(statements(f)[1],/FOR SHARE/);
});
test('suspended account denied before any overview read',async()=>{
 const f=fixture({suspended:true});const svc=new dashboard.DashboardService(f.db,{},{});
 await assert.rejects(svc.summary(actor()),ForbiddenException);
 assert.equal(find(f,'FROM assets a WHERE'),-1);assert.equal(statements(f).at(-1),'ROLLBACK');
});
test('role revoked from ORG_ADMIN limits all dashboard queries to participant scope',async()=>{
 const f=fixture({role:'REVIEWER'});const summary=await new dashboard.DashboardService(f.db,{},{}).summary(actor('ORG_ADMIN'));
 assert.equal(summary.assets.total,2);
 const q=f.events.filter(e=>e[0].startsWith('SELECT')&&e[0].includes('::bool'));
 assert.equal(q.length,4);for(const x of q){assert.equal(x[1][1],false);assert.equal(x[1][0],ids.org);}
 assert(find(f,'FOR SHARE')<find(f,'FROM assets a WHERE'));assert.equal(f.commits,1);
});
test('live administrator role is authoritative even when token claims reviewer',async()=>{
 const f=fixture({role:'ORG_ADMIN'});await new dashboard.DashboardService(f.db,{},{}).summary(actor('REVIEWER'));
 const q=f.events.filter(e=>e[0].includes('::bool'));assert.equal(q.length,4);assert(q.every(x=>x[1][1]===true));
});
test('dashboard identity check and all four reads use one transaction',async()=>{
 const f=fixture();const svc=new dashboard.DashboardService(f.db,{},{});
 await svc.summary(actor());assert.equal(f.commits,1);assert.equal(find(f,"set_config('assettrust.tenant_id'"),1);
 assert.equal(find(f,'FROM users'),2);assert.equal(statements(f).filter(x=>x.includes('FROM documents d')).length,1);
});
test('case report denies revoked participation before metadata/evidence',async()=>{
 const f=fixture({canCase:false,role:'REVIEWER'});
 const svc=new dashboard.DashboardService(f.db,{case:()=>{throw Error('obsolete read preflight')}},{organization:async()=>{throw Error('published invoked')} });
 await assert.rejects(svc.report(actor('ORG_ADMIN'),ids.case),ForbiddenException);
 assert.equal(find(f,'SELECT c.*,a.asset_code'),-1);assert.equal(find(f,'FROM case_evidence'),-1);assert.equal(f.commits,0);
});
test('case report cannot be read after suspension',async()=>{
 const f=fixture({suspended:true});await assert.rejects(new dashboard.DashboardService(f.db,{},{}).report(actor(),ids.case),ForbiddenException);
 assert.equal(find(f,'SELECT c.*,a.asset_code'),-1);
});
test('case report holds case permission through evidence and template read',async()=>{
 const f=fixture();let templateCalled=false;
 const published={organization:async(tx,org,key,values)=>{
  assert(f.active);templateCalled=true;assert.equal(org,ids.org);assert.equal(key,'report.summary');
  await tx.query('SELECT body,revision FROM admin_content_templates WHERE scope_id=$1',[org]);return {text:'draft'};
 }};
 const r=await new dashboard.DashboardService(f.db,{case:()=>{throw Error('obsolete preflight')}},published).report(actor(),ids.case);
 assert.equal(r.case.case_code,'CASE-X');assert.equal(r.evidence.length,1);assert(templateCalled);assert.equal(f.commits,1);
 assert(find(f,'FOR SHARE OF c,actor')<find(f,'SELECT c.*,a.asset_code'));
 assert(find(f,'SELECT c.*,a.asset_code')<find(f,'FROM case_evidence'));
 assert(find(f,'FROM case_evidence')<find(f,'FROM admin_content_templates'));
});
for(const method of ['verify','list']){
 test('audit '+method+' denies demoted token administrator before ledger read',async()=>{
  const f=fixture({role:'REVIEWER'});await assert.rejects(new audit.AuditService(f.db)[method](actor('ORG_ADMIN')),ForbiddenException);
  assert.equal(find(f,'FROM audit_events'),-1);assert.equal(f.commits,0);
 });
 test('audit '+method+' denies suspended administrator before ledger read',async()=>{
  const f=fixture({suspended:true});await assert.rejects(new audit.AuditService(f.db)[method](actor('ORG_ADMIN')),ForbiddenException);
  assert.equal(find(f,'FROM audit_events'),-1);
 });
 test('audit '+method+' scopes permission and rows in one transaction',async()=>{
  const f=fixture();const result=await new audit.AuditService(f.db)[method](actor());
  assert.equal(f.commits,1);assert(find(f,'FROM users')<find(f,'FROM audit_events'));
  if(method==='verify')assert.equal(result.verified,true);else assert.deepEqual(Array.from(result),[]);
 });
}
test('tampered audit chain still fails integrity check',async()=>{
 const f=fixture({rows:[{id:'e',organization_id:ids.org,actor_id:ids.actor,action:'WRITE',entity_type:'asset',entity_id:'asset',detail:{},created_at:new Date().toISOString(),previous_hash:'GENESIS',event_hash:'not-a-hash'}]});
 const r=await new audit.AuditService(f.db).verify(actor());assert.equal(r.verified,false);assert.equal(r.firstInvalidEventId,'e');
});
for(const method of ['localProof','status']){
 test('integrations '+method+' denies stale elevated role',async()=>{
  const f=fixture({role:'CLIENT'}),c=new integrations.IntegrationsController(f.db);
  await assert.rejects(c[method]({user:actor('ORG_ADMIN')}),ForbiddenException);
  assert.equal(find(f,'FROM audit_events'),-1);assert.equal(f.commits,0);
 });
 test('integrations '+method+' denies suspended administrator',async()=>{
  const f=fixture({suspended:true});await assert.rejects(new integrations.IntegrationsController(f.db)[method]({user:actor()}),ForbiddenException);
 });
 test('integrations '+method+' uses current transaction-scoped DB authority',async()=>{
  const f=fixture(),c=new integrations.IntegrationsController(f.db);
  const r=await c[method]({user:actor('REVIEWER')});assert.equal(f.commits,1);
  assert(find(f,'FROM users')>=0);
  if(method==='localProof'){assert.equal(r.kind,'LOCAL_AUDIT_COMMITMENT_NOT_BLOCKCHAIN');assert(find(f,'FROM audit_events')>find(f,'FROM users'));}
  else assert.equal(r.payments.state,'NOT_CONNECTED');
 });
}
test('new protected controllers do not use JWT administrator bypass for these read paths',()=>{
 const source=['dashboard.ts','audit.ts','integrations.ts'].map(x=>fs.readFileSync(path.join(ROOT,'apps/api/src',x),'utf8'));
 assert(!source[0].includes("const privileged=u.role==='ORG_ADMIN'"));
 assert(!source[1].includes("assertRole(u,['ORG_ADMIN'])"));
 assert(!source[2].includes("assertRole(user,['ORG_ADMIN'])"));
 assert(source.every(s=>s.includes('this.db.transaction(')));
});
test('all three workspace manifests identify current v0.79 milestone',()=>{
 for(const p of ['package.json','apps/api/package.json','apps/web/package.json']){const version=JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')).version;assert.match(version,/^0\.\d+\.0$/);assert(Number(version.split('.')[1])>=79);} 
});
