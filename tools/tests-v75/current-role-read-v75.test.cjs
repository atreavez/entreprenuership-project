'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),child=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const ts=(()=>{try{return require('typescript')}catch{return require(path.join(child.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();
function load(file,imports){
 const src=fs.readFileSync(path.join(root,file),'utf8');
 const compiled=ts.transpileModule(src,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:id=>{if(!(id in imports))throw Error('Missing stub '+id+' for '+file);return imports[id]},process,Promise,Date,Buffer,console,Error},{timeout:4000,filename:file});
 return mod.exports;
}
class ForbiddenException extends Error{}class NotFoundException extends Error{}class BadRequestException extends Error{}class ConflictException extends Error{}
const noop=()=>()=>{};
const nest={ForbiddenException,NotFoundException,BadRequestException,ConflictException,Controller:noop,Get:noop,Post:noop,Param:noop,Query:noop,Body:noop,Req:noop,UseGuards:noop,Injectable:noop,Module:noop};
const scope={setTenantScope:async(tx,org)=>tx.query('SET TENANT SCOPE',[org])};
const guards=load('apps/api/src/contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
const org='00000000-0000-4000-8000-000000000111',me='00000000-0000-4000-8000-000000000112',asset='00000000-0000-4000-8000-000000000113',caze='00000000-0000-4000-8000-000000000114';
const actor={id:me,organizationId:org,role:'ORG_ADMIN',professionalApproved:false};
const stubClass=class{};
const common={uid:()=>asset,text:x=>x,optionalText:x=>x,enumValue:x=>x,isUuid:x=>x,UserAuth:stubClass,assertRole:(u,roles)=>{if(!roles.includes(u.role))throw new ForbiddenException()}};
const assetLib=load('apps/api/src/assets.ts',{
 '@nestjs/common':nest,'./database':{Database:stubClass},'./audit':{AuditModule:stubClass,AuditService:stubClass},'./auth':{AuthGuard:stubClass,AuthModule:stubClass},'./common':common,'./access':{AccessModule:stubClass,AccessService:stubClass},'./contexts/tenant-isolation/application/tenant-scope':scope,'./contexts/access/infrastructure/transactional-access':guards
});
const caseLib=load('apps/api/src/cases.ts',{
 '@nestjs/common':nest,'./database':{Database:stubClass},'./audit':{AuditModule:stubClass,AuditService:stubClass},'./auth':{AuthGuard:stubClass,AuthModule:stubClass},'./common':common,'./access':{AccessModule:stubClass,AccessService:stubClass},'./contexts/tenant-isolation/application/tenant-scope':scope,
 './contexts/content-publishing/infrastructure/published-content.module':{PublishedContentModule:stubClass,PublishedContentService:stubClass},
 './contexts/verification/application/evidence-workflow':{EvidenceWorkflow:stubClass,WorkflowFailure:class extends Error{}},
 './contexts/verification/infrastructure/postgres-workflow.repository':{PostgresWorkflowRepository:stubClass},
 './contexts/verification/domain/evidence-policy':{STAGES:['INTAKE','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW','CLOSED']},
 './contexts/access/infrastructure/transactional-access':guards,
 './contexts/verification/infrastructure/current-evidence-authorizer':{requireCurrentEvidenceSubmission:async()=>{}},
 './contexts/verification/infrastructure/current-case-assignment':{requireCurrentCaseAssignment:async()=>{}}
});
function setup(opts={}){
 const calls=[],role=opts.role||'ORG_ADMIN',disabled=!!opts.suspended;
 let writes=0,audits=0, transactions=0;
 const tx={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql==='SET TENANT SCOPE')return {rows:[]};
  if(sql.includes('JOIN users actor') && sql.includes('FOR SHARE OF a,actor'))return {rows:opts.assetMissing||disabled?[]:[{id:asset,created_by:opts.assetOwner||me,role}]};
  if(sql.includes('JOIN users actor') && sql.includes('FOR SHARE OF c,actor'))return {rows:opts.caseMissing||disabled?[]:[{id:caze,created_by:opts.caseOwner||me,assigned_to:opts.caseAssignee||null,role}]};
  if(sql.includes('SELECT id,role FROM users'))return {rows:disabled?[]:[{id:me,role}]};
  if(sql.includes('FROM verification_cases c') && sql.includes('LIMIT 1 FOR SHARE'))return {rows:opts.canSeeCase?[{id:caze}]:[]};
  if(sql.includes('FROM resource_grants g') && sql.includes('LIMIT 1 FOR SHARE'))return {rows:opts.hasGrant?[{id:'grant'}]:[]};
  if(sql.includes('SELECT * FROM assets'))return {rows:opts.assetMissing?[]:[{id:asset,asset_type:'LAND'}]};
  if(sql.includes('SELECT c.*,a.asset_code'))return {rows:opts.caseMissing?[]:[{id:caze,asset_id:asset}]};
  if(sql.includes('SELECT id,stage,evidence_type'))return {rows:[{id:'evidence'}]};
  if(sql.includes('INSERT INTO assets')){writes++;return {rows:[]}};
  throw Error('Unexpected transaction SQL: '+sql);
 }};
 const db={transaction:async f=>{transactions++;calls.push({sql:'BEGIN'});try{const out=await f(tx);calls.push({sql:'COMMIT'});return out}catch(e){calls.push({sql:'ROLLBACK'});throw e}},tenantQuery:async(orgId,sql,params)=>{
  calls.push({sql,params,organizationId:orgId});
  if(sql.includes('JOIN users actor') && !sql.includes('FOR SHARE'))return {rows:disabled?[]:opts.listRows||[]};
  throw Error('Unexpected tenant SQL '+sql);
 }};
 const audit={write:async()=>{audits++;calls.push({sql:'AUDIT'})}};
 return {db,audit,calls,get writes(){return writes},get audits(){return audits},get transactions(){return transactions}};
}
const assets=f=>new assetLib.AssetsService(f.db,f.audit,{asset:async()=>{throw Error('Legacy precheck must not be called')}});
const cases=f=>new caseLib.CasesService(f.db,f.audit,{case:async()=>{throw Error('Legacy precheck must not be called')}}, {}, {});
const validAsset={assetType:'LAND',district:'Kampala',declaredOwner:'Synthetic Owner'};

test('asset listing joins a currently active database member rather than trusting token role',async()=>{
 const f=setup({listRows:[{id:asset}]});assert.equal((await assets(f).list(actor,{})).length,1);
 const q=f.calls.find(c=>c.sql.includes('FROM assets a JOIN users actor'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);assert.match(q.sql,/actor\.role='ORG_ADMIN'/);
 assert(!q.sql.includes('$4::bool'));assert(!q.sql.includes('u.role'));
 assert.deepEqual(Array.from(q.params),[org,null,'%%',me]);
});
test('asset listing rejects suspended member in current statement',async()=>{const f=setup({suspended:true});assert.deepEqual(Array.from(await assets(f).list(actor,{})),[])});
test('asset listing retains tenant and grant expiration filters',async()=>{
 const f=setup();await assets(f).list(actor,{search:'car',type:'LAND'});
 const q=f.calls.find(c=>c.sql.includes('FROM assets a JOIN users actor'));
 assert.match(q.sql,/a\.organization_id=\$1/);assert.match(q.sql,/g\.expires_at>now\(\)/);
 assert.deepEqual(Array.from(q.params),[org,'LAND','%car%',me]);
});
test('asset read occurs inside one transaction after locking current permission',async()=>{
 const f=setup();const result=await assets(f).get(actor,asset);assert.equal(result.id,asset);
 const xs=f.calls.map(c=>c.sql),lock=xs.findIndex(q=>q.includes('FOR SHARE OF a,actor'));
 assert(xs.indexOf('SET TENANT SCOPE')<lock);assert(lock<xs.findIndex(q=>q.includes('SELECT * FROM assets')));
 assert(xs.indexOf('COMMIT')>lock);assert.equal(f.transactions,1);
});
test('a former admin cannot read unrelated asset after role downgrade',async()=>{
 const f=setup({role:'CLIENT',assetOwner:'someone-else'});
 await assert.rejects(assets(f).get(actor,asset),ForbiddenException);
 assert(!f.calls.some(c=>c.sql.includes('SELECT * FROM assets')));assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('suspended user cannot read an asset even when token says ORG_ADMIN',async()=>{
 const f=setup({suspended:true});await assert.rejects(assets(f).get(actor,asset),NotFoundException);
 assert(!f.calls.some(c=>c.sql.includes('SELECT * FROM assets')));
});
test('asset read grant permits access but confidential case grant is not automatically assumed',async()=>{
 const f=setup({role:'CLIENT',assetOwner:'someone-else',hasGrant:true});assert.equal((await assets(f).get(actor,asset)).id,asset);
});
test('asset create locks current active role before INSERT and audit',async()=>{
 const f=setup();const svc=assets(f);svc.get=async()=>({id:asset});await svc.create(actor,validAsset);
 const xs=f.calls.map(c=>c.sql);const check=xs.findIndex(x=>x.includes('SELECT id,role FROM users'));
 const insert=xs.findIndex(x=>x.includes('INSERT INTO assets'));
 assert(check>xs.indexOf('SET TENANT SCOPE')&&check<insert);assert.match(xs[check],/FOR SHARE/);assert(xs.indexOf('AUDIT')>insert);
 assert.equal(f.writes,1);assert.equal(f.audits,1);
});
for(const role of ['SURVEYOR','LEGAL_REVIEWER','OTHER']){
 test('asset create refuses stale allowed token when current role is '+role,async()=>{
  const f=setup({role});await assert.rejects(assets(f).create(actor,validAsset),ForbiddenException);
  assert.equal(f.writes,0);assert.equal(f.audits,0);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 });
}
test('asset create refuses suspended user before INSERT or audit',async()=>{
 const f=setup({suspended:true});await assert.rejects(assets(f).create(actor,validAsset),ForbiddenException);
 assert.equal(f.writes,0);assert.equal(f.audits,0);
});
test('current CLIENT/REVIEWER can create own assets',async()=>{
 for(const role of ['CLIENT','REVIEWER']){
  const f=setup({role}),svc=assets(f);svc.get=async()=>({id:asset});await svc.create({...actor,role},validAsset);assert.equal(f.writes,1);
 }
});
test('case list checks active membership in the same tenant-scoped SQL',async()=>{
 const f=setup({listRows:[{id:caze}]});assert.equal((await cases(f).list(actor)).length,1);
 const q=f.calls.find(c=>c.sql.includes('FROM verification_cases c')&&c.sql.includes('JOIN users actor'));
 assert(q);assert.match(q.sql,/actor\.suspended_at IS NULL/);assert.match(q.sql,/actor\.role='ORG_ADMIN'/);assert(!q.sql.includes('$2::bool'));
 assert.deepEqual(Array.from(q.params),[org,me]);
});
test('case list hides records from suspended members',async()=>{const f=setup({suspended:true});assert.equal((await cases(f).list(actor)).length,0)});
test('case read locks active participant before fetching case data',async()=>{
 const f=setup();const c=await cases(f).get(actor,caze);assert.equal(c.id,caze);
 const xs=f.calls.map(c=>c.sql),lock=xs.findIndex(q=>q.includes('FOR SHARE OF c,actor'));
 assert(xs.indexOf('SET TENANT SCOPE')<lock);assert(lock<xs.findIndex(q=>q.includes('SELECT c.*,a.asset_code')));
 assert.equal(f.transactions,1);assert(xs.indexOf('COMMIT')>lock);
});
test('former admin without case assignment is denied before confidential data query',async()=>{
 const f=setup({role:'CLIENT',caseOwner:'other',caseAssignee:'other'});
 await assert.rejects(cases(f).get(actor,caze),ForbiddenException);
 assert(!f.calls.some(c=>c.sql.includes('SELECT c.*,a.asset_code')));
});
test('current case creator and assignee can read their own case after role change',async()=>{
 const f=setup({role:'CLIENT',caseOwner:me});assert.equal((await cases(f).get(actor,caze)).id,caze);
 const g=setup({role:'REVIEWER',caseOwner:'other',caseAssignee:me});assert.equal((await cases(g).get(actor,caze)).id,caze);
});
test('suspended user is denied case details even with a valid-looking session role',async()=>{
 const f=setup({suspended:true});await assert.rejects(cases(f).get(actor,caze),ForbiddenException);
 assert(!f.calls.some(c=>c.sql.includes('SELECT c.*,a.asset_code')));
});
test('case evidence list does not use separate preflight authorization transaction',async()=>{
 const f=setup();assert.equal((await cases(f).listEvidence(actor,caze))[0].id,'evidence');
 const xs=f.calls.map(c=>c.sql),lock=xs.findIndex(q=>q.includes('FOR SHARE OF c,actor'));
 assert.equal(f.transactions,1);assert(lock<xs.findIndex(q=>q.includes('SELECT id,stage,evidence_type')));
 assert.equal(xs.filter(x=>x==='SET TENANT SCOPE').length,1);
});
test('case evidence stays confidential after admin demotion and never reaches SELECT',async()=>{
 const f=setup({role:'CLIENT',caseOwner:'other',caseAssignee:'other'});
 await assert.rejects(cases(f).listEvidence(actor,caze),ForbiddenException);
 assert(!f.calls.some(c=>c.sql.includes('SELECT id,stage,evidence_type')));
});
test('case evidence is unavailable after account suspension',async()=>{
 const f=setup({suspended:true});await assert.rejects(cases(f).listEvidence(actor,caze),ForbiddenException);
 assert(!f.calls.some(c=>c.sql.includes('SELECT id,stage,evidence_type')));
});
test('v75 scripts, CI wiring, and versions are consistent',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 assert.match(pkg.version,/^0\.\d+\.0$/);assert(Number(pkg.version.split('.')[1])>=75);assert(pkg.scripts['verify:v75'].includes('tests-v75'));
 for(const sub of ['apps/api','apps/web'])assert.equal(JSON.parse(fs.readFileSync(path.join(root,sub,'package.json'))).version,pkg.version);
 assert.match(fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8'),/npm run verify:v75/);
});
test('v75 does not edit migrations or disable RLS',()=>{
 const sql=fs.readdirSync(path.join(root,'apps/api/sql')).filter(x=>x.endsWith('.sql'));
 assert.equal(sql.length,27);
 const code=fs.readFileSync(path.join(root,'apps/api/src/database.ts'),'utf8');
 assert.match(code,/assertRuntimeIsolation/);assert.match(code,/inspectPolicyInventory/);
});
