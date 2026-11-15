'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}class NotFoundException extends Error{}class BadRequestException extends Error{}class ConflictException extends Error{}
const decorator=()=>()=>{};
const nest={ForbiddenException,NotFoundException,BadRequestException,ConflictException,Injectable:decorator,Controller:decorator,Module:decorator,Get:decorator,Post:decorator,Param:decorator,Req:decorator,UseGuards:decorator,Body:decorator};
function load(relative,imports={}){const file=path.join(root,relative),m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;vm.runInNewContext(js,{module:m,exports:m.exports,require:i=>{if(Object.hasOwn(imports,i))return imports[i];throw Error('unexpected '+i)},Object,Date,Error,String,JSON,Number,Map,console},{timeout:5000,filename:file});return m.exports;}
const contentPolicy=load('contexts/content-admin/domain/template-policy.ts');
const publicationPolicy=load('contexts/content-publishing/domain/publication-policy.ts',{'../../content-admin/domain/template-policy':contentPolicy});
const publishing=load('contexts/content-publishing/infrastructure/published-content.module.ts',{'@nestjs/common':nest,'../../../database':{},'../domain/publication-policy':publicationPolicy});
const {PublishedContentService}=publishing;
const USER={id:'actor',organizationId:'org-a',role:'ORG_ADMIN',fullName:'Ada'};
test('published content read is tenant-scoped and never accesses pending proposals',async()=>{
 const statements=[];const reader={async query(sql,params){statements.push({sql,params});return {rows:[{revision:4,body:'Case {{case_reference}} for {{recipient_name}}'}]}}};
 const svc=new PublishedContentService(reader);
 const result=await svc.organization(reader,'org-a','notification.case_assigned',{case_reference:'X-1',recipient_name:'Ada',organization_name:'Org'});
 assert.equal(result.text,'Case X-1 for Ada');assert.equal(result.revision,4);
 assert.match(statements[0].sql,/admin_content_templates/);assert.doesNotMatch(statements[0].sql,/admin_content_proposals/);
 assert.match(statements[0].sql,/scope='organization' AND scope_id=\$1 AND template_key=\$2/);
 assert.deepEqual(Array.from(statements[0].params),['org-a','notification.case_assigned']);
});
test('public content enforces global-only allowlist and published rows',async()=>{
 const seen=[];const svc=new PublishedContentService({async query(sql,p){seen.push([sql,p]);return {rows:[{body:'Safer land review, with evidence',revision:3}]}}});
 const result=await svc.publicCopy('website.hero_title');assert.equal(result.revision,3);assert.equal(result.legalStatus,'UNOFFICIAL_PLATFORM_INFORMATION');
 assert.equal(seen.length,1);assert.equal(seen[0][1][0],'00000000-0000-0000-0000-000000000000');
 assert.match(seen[0][0],/scope='platform'/);
 await assert.rejects(()=>svc.publicCopy('report.summary'),NotFoundException);
 await assert.rejects(()=>svc.publicCopy('notification.case_assigned'),NotFoundException);
 assert.equal(seen.length,1);
});
test('published template with malformed value fails closed (no private fallback)',async()=>{
 const svc=new PublishedContentService({});
 await assert.rejects(()=>svc.organization({query:async()=>({rows:[{body:'<script>alert(1)</script>',revision:1}]})},'org-a','report.summary',{asset_reference:'A',case_reference:'C',organization_name:'Org'}));
});
const currentReadAuthority=load(
 'contexts/access/infrastructure/current-read-authority.ts',
 {'@nestjs/common':nest}
);
const transactionalAccess=load(
 'contexts/access/infrastructure/transactional-access.ts',
 {'@nestjs/common':nest}
);
const dashboard=load('dashboard.ts',{
 './contexts/access/infrastructure/current-read-authority':currentReadAuthority,
 './contexts/access/infrastructure/transactional-access':transactionalAccess,'./contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'@nestjs/common':nest,'./database':{},'./auth':{AuthGuard:class{},AuthModule:class{}},'./common':{isUuid:x=>x},'./access':{AccessModule:class{}},'./contexts/content-publishing/infrastructure/published-content.module':publishing,'./contexts/content-publishing/domain/publication-policy':publicationPolicy});
test('actual evidence-report method supplies approved revision and fixed legal notice',async()=>{
 let calls=0;const db={transaction:async fn=>fn({query:(sql,params)=>db.tenantQuery(USER.organizationId,sql,params)}),async tenantQuery(_org,sql,params){calls++;
 if(sql.includes('SELECT c.id,c.created_by,c.assigned_to,actor.role')){
  assert.deepEqual(Array.from(params),['case-uuid','org-a','actor']);
  return {rows:[{id:'case-uuid',role:'ORG_ADMIN',created_by:'other',assigned_to:'other'}]};
 }
 if(sql.includes('FROM verification_cases'))return {rows:[{case_code:'AT-C1',asset_code:'AT-A1',organization_name:'North Desk'}]};return {rows:[{review_status:'ACCEPTED'}]}}};
 const service=new dashboard.DashboardService(db,{case:async()=>{}},{organization:async(tx,org,key,vars)=>{assert.equal(org,'org-a');assert.equal(key,'report.summary');return publicationPolicy.publishText('organization',key,{body:'Evidence for {{asset_reference}}',revision:6},vars)}});
 const report=await service.report(USER,'case-uuid');assert.equal(report.publication.templateRevision,6);assert.equal(report.publication.summary,'Evidence for AT-A1');assert.equal(report.evidence.length,1);assert.equal(report.publication.status,'DRAFT');assert.match(report.publication.legalNotice,/not a government-issued title/);assert.equal(calls,3);
});
const cases=load('cases.ts',{'./contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'@nestjs/common':nest,'./database':{},'./audit':{AuditModule:class{}},'./auth':{AuthModule:class{},AuthGuard:class{}},'./common':{uid:()=> 'e5d3b8d6-56af-4450-a542-209104f84b80',isUuid:x=>x,assertRole:()=>{}},'./access':{AccessModule:class{}},'./contexts/content-publishing/infrastructure/published-content.module':publishing,'./contexts/verification/application/evidence-workflow':{EvidenceWorkflow:class{},WorkflowFailure:class{}},'./contexts/verification/infrastructure/postgres-workflow.repository':{PostgresWorkflowRepository:class{}},'./contexts/verification/domain/evidence-policy':{STAGES:['INTAKE','CLOSED']},'./contexts/access/infrastructure/transactional-access':{requireCurrentAssetContribution:()=>{}},'./contexts/verification/infrastructure/current-evidence-authorizer':{requireCurrentEvidenceSubmission:()=>{}},'./contexts/verification/infrastructure/current-case-assignment':{requireCurrentCaseAssignment:async()=>{}}});
test('actual case assignment persists approved in-app text atomically, without external delivery',async()=>{
 const statements=[];const tx={async query(sql,p){statements.push({sql,p});if(sql.includes('recipient.full_name'))return {rows:[{case_code:'AT-C1',recipient_name:'Grace',organization_name:'Trusted Team'}]};if(sql.includes('UPDATE verification_cases'))return {rows:[{id:'case-uuid'}]};return {rows:[]}}};
 const db={transaction:fn=>fn(tx)};
 const published={organization:async(reader,org,key,ctx)=>{assert.equal(reader,tx);assert.equal(org,'org-a');return publicationPolicy.publishText('organization',key,{body:'Case {{case_reference}} assigned to {{recipient_name}}',revision:2},ctx)}};
 const service=new cases.CasesService(db,{write:async()=>{}},{}, {},published);service.get=async()=>({id:'case-uuid'});
 await service.assign(USER,'case-uuid','recipient-uuid');const written=statements.find(x=>x.sql.includes('INSERT INTO notifications'));
 assert(written);assert.equal(written.p[3],'Case AT-C1 assigned to Grace');assert(!statements.some(x=>/email|sms|https?:\/\//i.test(x.sql)));
});
test('case reassignment refuses recipient whose current tenant record is unavailable',async()=>{
 const statements=[];const db={transaction:async fn=>fn({query:async(sql,p)=>{statements.push(sql);if(sql.includes('UPDATE verification_cases'))return {rows:[{id:'case-uuid'}]};return {rows:[]}}})};
 const service=new cases.CasesService(db,{write:async()=>{}},{},{},{organization:async()=>{throw Error('must not publish')}});
 service.get=async()=>({});
 await assert.rejects(()=>service.assign(USER,'case-uuid','recipient'),ForbiddenException);
 assert(!statements.some(x=>x.includes('INSERT INTO notifications')));
});

test('report denies a current nonparticipant despite a stale admin claim',async()=>{
 const statements=[];let publications=0;
 const tx={async query(sql,params){
  statements.push(sql);
  assert.deepEqual(Array.from(params),['case-uuid','org-a','actor']);
  if(sql.includes('SELECT c.id,c.created_by,c.assigned_to,actor.role')){
   return {rows:[{id:'case-uuid',role:'REVIEWER',created_by:'other',assigned_to:'other'}]};
  }
  throw Error('Report data must not be queried after authorization fails');
 }};
 const db={transaction:async fn=>fn(tx)};
 const service=new dashboard.DashboardService(db,{},{
  organization:async()=>{publications++;throw Error('Must not publish');}
 });
 await assert.rejects(()=>service.report(USER,'case-uuid'),ForbiddenException);
 assert.equal(statements.length,1);
 assert.equal(publications,0);
});
