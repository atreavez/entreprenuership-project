'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}class NotFoundException extends Error{}class ConflictException extends Error{}class BadRequestException extends Error{}
const noop=()=>()=>{};
const nest={ForbiddenException,NotFoundException,ConflictException,BadRequestException,Controller:noop,Get:noop,Post:noop,Param:noop,Body:noop,Req:noop,UseGuards:noop,Injectable:noop,Module:noop};
function load(file,imports={}){
 const source=path.join(root,file);const js=ts.transpileModule(fs.readFileSync(source,'utf8'),{fileName:source,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const ctx={module:{exports:{}},exports:{},require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected import '+id)},console,Date};ctx.exports=ctx.module.exports;
 vm.runInNewContext(js,ctx,{filename:source,timeout:5000});return ctx.module.exports;
}
const domain=load('contexts/verification/domain/evidence-policy.ts');
const assignment=load('contexts/verification/infrastructure/current-case-assignment.ts',{'@nestjs/common':nest,'../domain/evidence-policy':domain});
const transactionalAccess=load(
 'contexts/access/infrastructure/transactional-access.ts',
 {'@nestjs/common':nest}
);
const {CasesService}=load('cases.ts',{
 '@nestjs/common':nest,'./database':{},'./audit':{AuditModule:class{}},'./auth':{AuthGuard:class{},AuthModule:class{}},
 './common':{uid:()=>'uuid',text:x=>x,optionalText:x=>x,isUuid:x=>x,enumValue:x=>x,assertRole:()=>{}},
 './access':{AccessModule:class{}},
 './contexts/content-publishing/infrastructure/published-content.module':{PublishedContentModule:class{}},
 './contexts/verification/application/evidence-workflow':{EvidenceWorkflow:class{},WorkflowFailure:class extends Error{}},
 './contexts/verification/infrastructure/postgres-workflow.repository':{PostgresWorkflowRepository:class{}},
 './contexts/verification/domain/evidence-policy':domain,
 './contexts/access/infrastructure/transactional-access':transactionalAccess,
 './contexts/verification/infrastructure/current-evidence-authorizer':{},
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},
 './contexts/verification/infrastructure/current-case-assignment':assignment
});
const user={id:'operator',organizationId:'org',role:'ORG_ADMIN'};
function fixture({role='ORG_ADMIN',assignee='SURVEYOR',hasCase=true,accredited=true,open=true}={}){
 let updates=0,notifications=0,audits=0;const sql=[];
 const transactionQuery=async(q,params)=>{
  sql.push(q);
  if(q.includes('SELECT c.id,c.created_by,c.assigned_to,actor.role')){
   assert.deepEqual(Array.from(params),['case','org','operator']);
   return {rows:hasCase?[{
    id:'case',created_by:'creator',assigned_to:'surveyor',role
   }]:[]};
  }
  if(q.includes('SELECT c.*,a.asset_code')){
   assert.deepEqual(Array.from(params),['case','org']);
   return {rows:hasCase?[{id:'case'}]:[]};
  }
  if(/FROM verification_cases c\s+JOIN users actor/.test(q))return {rows:hasCase?[{id:'case',stage:'FIELD_INSPECTION',status:open?'OPEN':'CLOSED',actor_role:role,assignee_role:assignee}]:[]};
  if(/FROM professional_accreditations p/.test(q))return {rows:accredited?[{user_id:'surveyor'}]:[]};
  if(/recipient.full_name AS recipient_name/.test(q))return {rows:[{case_code:'AT-CASE',recipient_name:'Test User',organization_name:'Demo Org'}]};
  if(/UPDATE verification_cases SET assigned_to/.test(q)){updates++;return {rows:[{id:'case'}],rowCount:1};}
  if(/INSERT INTO notifications/.test(q)){notifications++;return {rows:[],rowCount:1};}
  throw Error('Unexpected SQL '+q);
 };
 const db={transaction:async fn=>fn({query:transactionQuery}),tenantQuery:async (_org,q)=>({rows:[{id:'case'}]})};
 const service=new CasesService(db,{write:async()=>{audits++}},{case:async()=>{}},{},{organization:async()=>({text:'Assigned case in-app',revision:0})});
 return {service,sql,get updates(){return updates},get notifications(){return notifications},get audits(){return audits}};
}
test('CaseService cannot write assignment/notification/audit when admin is downgraded',async()=>{
 const f=fixture({role:'REVIEWER'});await assert.rejects(()=>f.service.assign(user,'case','surveyor'),ForbiddenException);
 assert.equal(f.updates,0);assert.equal(f.notifications,0);assert.equal(f.audits,0);
});
test('CaseService cannot write when assignee loses accreditation',async()=>{
 const f=fixture({accredited:false});await assert.rejects(()=>f.service.assign(user,'case','surveyor'),ForbiddenException);
 assert.equal(f.updates,0);assert.equal(f.notifications,0);assert.equal(f.audits,0);
});
test('CaseService cannot write to closed case',async()=>{
 const f=fixture({open:false});await assert.rejects(()=>f.service.assign(user,'case','surveyor'),ConflictException);
 assert.equal(f.updates,0);assert.equal(f.notifications,0);assert.equal(f.audits,0);
});
test('currently authorized case assignment commits mutation, notice and audit',async()=>{
 const f=fixture();const result=await f.service.assign(user,'case','surveyor');assert.equal(result.id,'case');
 assert.equal(f.updates,1);assert.equal(f.notifications,1);assert.equal(f.audits,1);
});

test('case read rejects a downgraded nonparticipant despite a stale admin claim',async()=>{
 const f=fixture({role:'REVIEWER'});
 await assert.rejects(()=>f.service.get(user,'case'),ForbiddenException);
 assert.equal(f.sql.some(q=>q.includes('SELECT c.*,a.asset_code')),false);
 assert.equal(f.updates,0);assert.equal(f.notifications,0);assert.equal(f.audits,0);
});
test('case read rejects an absent case before fetching its details',async()=>{
 const f=fixture({hasCase:false});
 await assert.rejects(()=>f.service.get(user,'case'),ForbiddenException);
 assert.equal(f.sql.some(q=>q.includes('SELECT c.*,a.asset_code')),false);
});
