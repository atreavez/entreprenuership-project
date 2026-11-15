'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const base=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}
class NotFoundException extends Error{}
class ConflictException extends Error{}
const nest={ForbiddenException,NotFoundException,ConflictException};
function load(relative,imports={}){
 const file=path.join(base,relative);const src=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(src,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const ctx={module:{exports:{}},exports:{},console,require:(id)=>{if(Object.hasOwn(imports,id))return imports[id];if(id==='../domain/evidence-policy')return load('contexts/verification/domain/evidence-policy.ts');throw Error('Unexpected import '+id)},Date};
 ctx.exports=ctx.module.exports;vm.runInNewContext(js,ctx,{filename:file,timeout:3000});return ctx.module.exports;
}
const actor={id:'reviewer',organizationId:'org',role:'LEGAL_REVIEWER',professionalApproved:true};
function actorFixture({membership=true,role='LEGAL_REVIEWER',credential=true}={}){
 const queries=[];const tx={query:async(sql,params)=>{
  queries.push({sql,params});
  if(/FROM users u\s+WHERE/.test(sql))return {rows:membership?[{role}]:[]};
  if(/FROM professional_accreditations p/.test(sql))return {rows:credential?[{user_id:actor.id}]:[]};
  throw Error('Unexpected SQL '+sql);
 }};return {tx,queries};
}
test('RED: current account absence fails closed before a stale legal reviewer can review',async()=>{
 const {loadCurrentWorkflowActor}=load('contexts/verification/infrastructure/current-workflow-authorizer.ts',{'@nestjs/common':nest});
 const f=actorFixture({membership:false});await assert.rejects(()=>loadCurrentWorkflowActor(f.tx,actor,'LEGAL_REVIEW'),ForbiddenException);
});
test('current role downgrade supersedes the authenticated snapshot',async()=>{
 const {loadCurrentWorkflowActor}=load('contexts/verification/infrastructure/current-workflow-authorizer.ts',{'@nestjs/common':nest});
 const f=actorFixture({role:'CLIENT'});const current=await loadCurrentWorkflowActor(f.tx,actor,'LEGAL_REVIEW');
 assert.equal(current.role,'CLIENT');assert.equal(current.professionalApproved,false);
 assert.match(f.queries[0].sql,/FOR SHARE/);
});
test('revoked professional credential cannot be treated as approved',async()=>{
 const {loadCurrentWorkflowActor}=load('contexts/verification/infrastructure/current-workflow-authorizer.ts',{'@nestjs/common':nest});
 const f=actorFixture({credential:false});const current=await loadCurrentWorkflowActor(f.tx,actor,'LEGAL_REVIEW');
 assert.equal(current.professionalApproved,false);
 assert.ok(f.queries.some(x=>/p\.revoked_at IS NULL/.test(x.sql)&&/p\.expires_at>now\(\)/.test(x.sql)&&/FOR SHARE/.test(x.sql)));
});
test('approved professional may review with verified current credentials',async()=>{
 const {loadCurrentWorkflowActor}=load('contexts/verification/infrastructure/current-workflow-authorizer.ts',{'@nestjs/common':nest});
 const f=actorFixture();const current=await loadCurrentWorkflowActor(f.tx,actor,'LEGAL_REVIEW');
 assert.equal(current.role,'LEGAL_REVIEWER');assert.equal(current.professionalApproved,true);
});
test('organization administrator never inherits stale professional approval',async()=>{
 const {loadCurrentWorkflowActor}=load('contexts/verification/infrastructure/current-workflow-authorizer.ts',{'@nestjs/common':nest});
 const f=actorFixture({role:'ORG_ADMIN'});const current=await loadCurrentWorkflowActor(f.tx,actor,'FINAL_REVIEW');
 assert.equal(current.professionalApproved,false);assert.equal(f.queries.length,1);
});
function assignmentFixture({adminRole='ORG_ADMIN',hasActor=true,assigneeRole='SURVEYOR',hasAssignee=true,status='OPEN',stage='FIELD_INSPECTION',accredited=true}={}){
 const queries=[];const tx={query:async(sql,params)=>{
  queries.push({sql,params});
  if(/FROM verification_cases c\s+JOIN users actor/.test(sql))return {rows:hasActor&&hasAssignee?[{id:'case',stage,status,actor_role:adminRole,assignee_role:assigneeRole}]:[]};
  if(/FROM professional_accreditations p/.test(sql))return {rows:accredited?[{user_id:'assignee'}]:[]};
  throw Error('Unexpected SQL '+sql);
 }};return {tx,queries};
}
test('RED: a downgraded admin cannot reassign a case using stale token',async()=>{
 const {requireCurrentCaseAssignment}=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest});
 const f=assignmentFixture({adminRole:'REVIEWER'});await assert.rejects(()=>requireCurrentCaseAssignment(f.tx,{id:'actor',organizationId:'org'},'case','assignee'),ForbiddenException);
});
test('deleted or cross-organization assignee cannot be assigned',async()=>{
 const {requireCurrentCaseAssignment}=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest});
 const f=assignmentFixture({hasAssignee:false});await assert.rejects(()=>requireCurrentCaseAssignment(f.tx,{id:'actor',organizationId:'org'},'case','assignee'),NotFoundException);
});
test('closed case cannot be reassigned',async()=>{
 const {requireCurrentCaseAssignment}=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest});
 const f=assignmentFixture({status:'CLOSED'});await assert.rejects(()=>requireCurrentCaseAssignment(f.tx,{id:'actor',organizationId:'org'},'case','assignee'),ConflictException);
});
test('unaccredited surveyor cannot be appointed to active field stage',async()=>{
 const {requireCurrentCaseAssignment}=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest});
 const f=assignmentFixture({accredited:false});await assert.rejects(()=>requireCurrentCaseAssignment(f.tx,{id:'actor',organizationId:'org'},'case','assignee'),ForbiddenException);
});
test('field assignment requires stage-qualified role',async()=>{
 const {requireCurrentCaseAssignment}=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest});
 const f=assignmentFixture({assigneeRole:'CLIENT'});await assert.rejects(()=>requireCurrentCaseAssignment(f.tx,{id:'actor',organizationId:'org'},'case','assignee'),ForbiddenException);
});
test('current accredited surveyor can be assigned while case and users are locked',async()=>{
 const {requireCurrentCaseAssignment}=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest});
 const f=assignmentFixture();await requireCurrentCaseAssignment(f.tx,{id:'actor',organizationId:'org'},'case','assignee');
 assert.match(f.queries[0].sql,/FOR UPDATE OF c/);assert.match(f.queries[0].sql,/FOR SHARE OF actor,assignee/);
});
test('workflow requests a fresh actor inside the same transaction before evidence review and advancement',async()=>{
 const workflowSrc=fs.readFileSync(path.join(base,'contexts/verification/application/evidence-workflow.ts'),'utf8');
 assert.match(workflowSrc,/await tx\.getCurrentActor\(actor,c\.stage\)/);
 assert.ok((workflowSrc.match(/await tx\.getCurrentActor\(actor,c\.stage\)/g)||[]).length>=2);
 const repoSrc=fs.readFileSync(path.join(base,'contexts/verification/infrastructure/postgres-workflow.repository.ts'),'utf8');
 assert.match(repoSrc,/getCurrentActor:\s*\(/);
 const caseSrc=fs.readFileSync(path.join(base,'cases.ts'),'utf8');
 assert.match(caseSrc,/requireCurrentCaseAssignment\(tx,u,caseId,targetId\)/);
});
