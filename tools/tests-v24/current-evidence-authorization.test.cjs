'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}
class NotFoundException extends Error{}
class ConflictException extends Error{}
class BadRequestException extends Error{}
const noop=()=>()=>{};
const nest={ForbiddenException,NotFoundException,ConflictException,BadRequestException,Controller:noop,Get:noop,Post:noop,Param:noop,Body:noop,Req:noop,UseGuards:noop,Injectable:noop,Module:noop};
function compile(file,imports){
 const source=path.join(root,file);
 const js=ts.transpileModule(fs.readFileSync(source,'utf8'),{fileName:source,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const sandbox={module:{exports:{}},exports:{},require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error(`Unexpected import ${id}`)},console,Date};
 sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(js,sandbox,{filename:source,timeout:5000});return sandbox.module.exports;
}
const authorizer=compile('contexts/verification/infrastructure/current-evidence-authorizer.ts',{'@nestjs/common':nest});
const actor={id:'actor-v24',organizationId:'org-v24',role:'REVIEWER',professionalApproved:true};
function fixture({role='REVIEWER',assignedTo=actor.id,status='OPEN',stage='INTAKE',accredited=true,hasCase=true}={}){
 const sql=[];let inserts=0,audits=0;const query=async(q,params)=>{
  sql.push(q);
  if(/FROM verification_cases c\s+JOIN users actor/i.test(q))return {rows:hasCase?[{id:'case-v24',asset_id:'asset-v24',stage,status,assigned_to:assignedTo,role}]:[]};
  if(/FROM professional_accreditations p/i.test(q))return {rows:accredited?[{id:'credential-v24'}]:[]};
  if(/FROM disputes/i.test(q))return {rows:[]};
  if(/INSERT INTO case_evidence/i.test(q)){inserts++;return {rowCount:1,rows:[]};}
  throw Error('Unexpected SQL '+q);
 };
 return {tx:{query},sql,get inserts(){return inserts},get audits(){return audits},audit:()=>{audits++}};
}
test('newly unassigned reviewer cannot submit evidence with stale authenticated role',async()=>{
 const f=fixture({assignedTo:'different-reviewer'});
 await assert.rejects(()=>authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','INTAKE'),ForbiddenException);
 assert.equal(f.sql.length,1);
});
test('updated role disallows evidence even when stale token still says REVIEWER',async()=>{
 const f=fixture({role:'CLIENT'});
 await assert.rejects(()=>authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','INTAKE'),ForbiddenException);
});
test('closed, changed-stage and missing cases are rejected inside the transaction',async()=>{
 for(const input of [{status:'CLOSED'},{stage:'DOCUMENT_REVIEW'},{hasCase:false}]){
  const f=fixture(input);
  await assert.rejects(()=>authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','INTAKE'));
 }
});
test('current case query locks case exclusively and actor membership with row share',async()=>{
 const f=fixture();await authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','INTAKE');
 assert.match(f.sql[0],/FOR UPDATE OF c FOR SHARE OF actor/i);
 assert.match(f.sql[0],/actor\.organization_id=c\.organization_id/i);
});
test('professional stage requires active current accreditation',async()=>{
 const f=fixture({role:'SURVEYOR',stage:'FIELD_INSPECTION',accredited:false});
 await assert.rejects(()=>authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','FIELD_INSPECTION'),ForbiddenException);
 assert.match(f.sql[1],/p\.revoked_at IS NULL AND p\.expires_at>now\(\)/i);
 assert.match(f.sql[1],/FOR SHARE/i);
});
test('wrong professional role cannot bypass with a credential for a different stage',async()=>{
 const f=fixture({role:'REVIEWER',stage:'LEGAL_REVIEW'});
 await assert.rejects(()=>authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','LEGAL_REVIEW'),ForbiddenException);
 assert.equal(f.sql.length,1);
});
test('current accredited surveyor may submit field inspection evidence',async()=>{
 const f=fixture({role:'SURVEYOR',stage:'FIELD_INSPECTION'});
 const r=await authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','FIELD_INSPECTION');
 assert.equal(r.assetId,'asset-v24');assert.equal(f.sql.length,2);
});
test('FINAL_REVIEW remains reserved for current organization administrator',async()=>{
 const f=fixture({role:'LEGAL_REVIEWER',stage:'FINAL_REVIEW'});
 await assert.rejects(()=>authorizer.requireCurrentEvidenceSubmission(f.tx,actor,'case-v24','FINAL_REVIEW'),ForbiddenException);
 const admin=fixture({role:'ORG_ADMIN',assignedTo:'another-user',stage:'FINAL_REVIEW'});
 await authorizer.requireCurrentEvidenceSubmission(admin.tx,actor,'case-v24','FINAL_REVIEW');
});
const actualAccess=compile('contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
const actualPolicy=compile('contexts/verification/domain/evidence-policy.ts',{});
const actualAssignment=compile('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest,'../domain/evidence-policy':actualPolicy});
const common={uid:()=> 'uuid-v24',isUuid:x=>x,text:x=>x,optionalText:x=>x??'',enumValue:(x,values)=>{if(!values.includes(x))throw new BadRequestException('Invalid value');return x},assertRole:()=>{}};
const {CasesService}=compile('cases.ts',{
 '@nestjs/common':nest,'./database':{},'./audit':{AuditModule:class{}},'./auth':{AuthGuard:class{},AuthModule:class{}},'./common':common,'./access':{AccessModule:class{}},
 './contexts/content-publishing/infrastructure/published-content.module':{PublishedContentModule:class{}},
 './contexts/verification/application/evidence-workflow':{EvidenceWorkflow:class{},WorkflowFailure:class extends Error{}},
 './contexts/verification/infrastructure/postgres-workflow.repository':{PostgresWorkflowRepository:class{}},
 './contexts/verification/domain/evidence-policy':{STAGES:['INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW','CLOSED']},
 './contexts/access/infrastructure/transactional-access':actualAccess,
 './contexts/verification/infrastructure/current-evidence-authorizer':authorizer,
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},
 './contexts/verification/infrastructure/current-case-assignment':actualAssignment
});
function evidenceService(opts={}){
 const f=fixture(opts);
 const db={transaction:async work=>work(f.tx)};
 const svc=new CasesService(db,{write:async()=>f.audit()},{case:async()=>{},asset:async()=>{}},{});
 return {svc,f};
}
const request={stage:'INTAKE',evidenceType:'IDENTITY',sourceName:'Applicant',observations:'Evidence received'};
test('actual CasesService.evidence denies revoked assignment before INSERT/audit',async()=>{
 const {svc,f}=evidenceService({assignedTo:'someone-else'});
 await assert.rejects(()=>svc.evidence(actor,'case-v24',request),ForbiddenException);
 assert.equal(f.inserts,0);assert.equal(f.audits,0);
});
test('actual CasesService.evidence allows current assignment and writes audit',async()=>{
 const {svc,f}=evidenceService();
 await svc.evidence(actor,'case-v24',request);
 assert.equal(f.inserts,1);assert.equal(f.audits,1);
});
test('actual CasesService.evidence denies changed stage before INSERT',async()=>{
 const {svc,f}=evidenceService({stage:'DOCUMENT_REVIEW'});
 await assert.rejects(()=>svc.evidence(actor,'case-v24',request),ConflictException);
 assert.equal(f.inserts,0);assert.equal(f.audits,0);
});
test('case creation uses transactional asset contribution check, not only initial guard',()=>{
 const source=fs.readFileSync(path.join(root,'cases.ts'),'utf8');
 const part=source.slice(source.indexOf(' async create('),source.indexOf(' async evidence('));
 assert.match(part,/this\.db\.transaction\(async tx\s*=>[\s\S]*requireCurrentAssetContribution\(tx,u,assetId,/i);
});
test('actual CasesService.create denies a revoked asset grant before INSERT/audit',async()=>{
 let inserts=0,audits=0;
 const tx={query:async sql=>{
  if(/FROM assets a JOIN users actor/i.test(sql))return {rows:[{id:'asset-v24',asset_type:'LAND',created_by:'another-creator',role:'CLIENT'}]};
  if(/FROM verification_cases c\s+WHERE/i.test(sql))return {rows:[]};
  if(/FROM resource_grants g\s+WHERE/i.test(sql))return {rows:[]};
  if(/INSERT INTO verification_cases/i.test(sql)){inserts++;return {rows:[]};}
  throw Error('Unexpected SQL: '+sql);
 }};
 const svc=new CasesService({transaction:fn=>fn(tx)},{write:()=>{audits++}},{asset:async()=>{}},{});
 await assert.rejects(()=>svc.create({...actor,role:'CLIENT'},{assetId:'asset-v24',assetType:'LAND',notes:'New case'}),ForbiddenException);
 assert.equal(inserts,0);assert.equal(audits,0);
});
test('actual CasesService.create allows the current asset creator in the transaction',async()=>{
 let inserts=0,audits=0;
 const tx={query:async sql=>{
  if(/FROM assets a JOIN users actor/i.test(sql))return {rows:[{id:'asset-v24',asset_type:'LAND',created_by:actor.id,role:'CLIENT'}]};
  if(/INSERT INTO verification_cases/i.test(sql)){inserts++;return {rows:[]};}
  if(/UPDATE assets SET status/i.test(sql))return {rows:[],rowCount:1};
  throw Error('Unexpected SQL: '+sql);
 }};
 const svc=new CasesService({transaction:fn=>fn(tx)},{write:async()=>{audits++}},{asset:async()=>{}},{});
 svc.get=async()=>({id:'case-v24'});
 await svc.create({...actor,role:'CLIENT'},{assetId:'asset-v24',assetType:'LAND',notes:'New case'});
 assert.equal(inserts,1);assert.equal(audits,1);
});
test('professional accreditation query references the user_id primary key from migration 005',()=>{
 const schema=fs.readFileSync(path.resolve(root,'../sql/005_professional_trust.sql'),'utf8');
 const query=fs.readFileSync(path.join(root,'contexts/verification/infrastructure/current-evidence-authorizer.ts'),'utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS professional_accreditations \(\s*user_id uuid PRIMARY KEY/i);
 assert.match(query,/SELECT p\.user_id FROM professional_accreditations p/i);
 assert.doesNotMatch(query,/SELECT p\.id FROM professional_accreditations p/i);
});
test('case creation checks CURRENT role even if request-time actor had an allowed role',async()=>{
 let inserts=0;
 const tx={query:async sql=>{
  if(/FROM assets a JOIN users actor/i.test(sql))return {rows:[{id:'asset-v24',asset_type:'LAND',created_by:actor.id,role:'SURVEYOR'}]};
  if(/INSERT INTO verification_cases/i.test(sql)){inserts++;return {rows:[]};}
  throw Error('Unexpected SQL: '+sql);
 }};
 const svc=new CasesService({transaction:fn=>fn(tx)},{write:async()=>{}},{asset:async()=>{}},{});
 await assert.rejects(()=>svc.create({...actor,role:'CLIENT'},{assetId:'asset-v24'}),ForbiddenException);
 assert.equal(inserts,0);
});
