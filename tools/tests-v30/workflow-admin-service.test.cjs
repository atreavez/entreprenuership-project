'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class BadRequestException extends Error{}class ForbiddenException extends Error{}class ConflictException extends Error{}class NotFoundException extends Error{}
const deco=()=>()=>{};
const nest={BadRequestException,ForbiddenException,ConflictException,NotFoundException,Body:deco,Controller:deco,Get:deco,Post:deco,Param:deco,Req:deco,UseGuards:deco,Injectable:deco,Module:deco};
function load(file,imports={}){const filename=path.join(root,file);const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected dependency '+id)},console,Date,JSON},{filename,timeout:5000});return m.exports;}
const evidence=load('contexts/verification/domain/evidence-policy.ts');
const policy=load('contexts/workflow-admin/domain/workflow-policy.ts',{'../../verification/domain/evidence-policy':evidence});
const stepup=load('contexts/identity/infrastructure/current-admin-step-up.ts',{'@nestjs/common':nest});
let ids=0;
const {WorkflowAdminService}=load('contexts/workflow-admin/infrastructure/workflow-admin.module.ts',{
 '@nestjs/common':nest,'../../../database':{},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},
 '../../../common':{uid:()=>`00000000-0000-4000-8000-${String(++ids).padStart(12,'0')}`,isUuid:x=>x},
 '../../identity/infrastructure/current-admin-step-up':stepup,
 '../../verification/domain/evidence-policy':evidence,'../domain/workflow-policy':policy
});
const adminA={id:'admin-a',role:'ORG_ADMIN',organizationId:'org-1'};
const adminB={id:'admin-b',role:'ORG_ADMIN',organizationId:'org-1'};
const outsider={id:'admin-z',role:'ORG_ADMIN',organizationId:'org-2'};
function create(){
 const state={stages:new Map(),proposals:new Map(),audit:[],sql:[],stepup:true,adminRead:true,proposerActive:true};
 async function query(sql,args=[]){state.sql.push({sql,args});
  if(sql.includes('JOIN auth_mfa_credentials'))return {rows:state.stepup?[{id:args[0]}]:[]};
  if(sql.includes('JOIN auth_sessions')&&sql.includes('FROM users u'))return {rows:state.adminRead?[{id:args[0]}]:[]};
  if(sql.includes('SELECT id FROM users WHERE id=$1'))return {rows:state.proposerActive?[{id:args[0]}]:[]};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('SELECT version FROM workflow_stage_policies')){const row=state.stages.get(args.join('|'));return {rows:row?[{version:row.version}]:[]};}
  if(sql.includes('SELECT id FROM workflow_stage_policy_changes')&&sql.includes("status='PENDING'")){return {rows:[...state.proposals.values()].filter(p=>p.organization_id===args[0]&&p.stage===args[1]&&p.status==='PENDING').map(p=>({id:p.id}))};}
  if(sql.includes('INSERT INTO workflow_stage_policy_changes')){const [id,organization_id,stage,target_days,reminder_days,additional_evidence_type,expected_version,reason,proposed_by]=args;state.proposals.set(id,{id,organization_id,stage,target_days,reminder_days,additional_evidence_type,expected_version,reason,proposed_by,status:'PENDING',decided_by:null});return {rows:[{id}],rowCount:1};}
  if(sql.includes('FROM workflow_stage_policy_changes WHERE id=$1')){const p=state.proposals.get(args[0]);return {rows:p&&p.organization_id===args[1]?[{...p}]:[]};}
  if(sql.includes('INSERT INTO workflow_stage_policies')){const [organization_id,stage,target_days,reminder_days,additional_evidence_type,version,updated_by,expected]=args;const key=organization_id+'|'+stage;const existing=state.stages.get(key);if(existing&&existing.version!==expected)return {rows:[]};state.stages.set(key,{organization_id,stage,target_days,reminder_days,additional_evidence_type,version,updated_by});return {rows:[{version}]};}
  if(sql.includes('UPDATE workflow_stage_policy_changes')){const p=state.proposals.get(args[0]);p.status=args[2];p.decided_by=args[3];return {rows:[],rowCount:1};}
  if(sql.includes('SELECT stage,target_days,reminder_days,additional_evidence_type,version,updated_at'))return {rows:[...state.stages.values()].filter(p=>p.organization_id===args[0])};
  if(sql.includes('FROM workflow_stage_policy_changes WHERE organization_id=$1 ORDER BY'))return {rows:[...state.proposals.values()].filter(p=>p.organization_id===args[0])};
  throw Error('Unexpected SQL: '+sql);
 }
 const db={transaction:fn=>fn({query})};
 const audit={write:async(_tx,_actor,action,_resource,id,details)=>state.audit.push({action,id,details})};
 return {svc:new WorkflowAdminService(db,audit),state};
}
const proposal=(stage='FIELD_INSPECTION',additionalEvidenceType='DOCUMENT')=>({stage,targetDays:8,reminderDays:3,additionalEvidenceType,expectedVersion:0,reason:'Additional evidence required for stage safety'});
test('stage catalogue is tenant scoped, lists mandatory evidence and defaults',async()=>{const {svc,state}=create();const r=await svc.stages(adminA,'s1');assert.equal(r.stages.length,6);assert.equal(r.stages.find(x=>x.stage==='LEGAL_REVIEW').requiredEvidence,'LEGAL_OPINION');assert.equal(r.stages.find(x=>x.stage==='LEGAL_REVIEW').version,0);assert(state.sql.some(q=>q.sql.includes('WHERE organization_id=$1')));});
test('organization admin cannot edit protected stage order or mandatory reviewer requirements',async()=>{const {svc,state}=create();await assert.rejects(()=>svc.propose(adminA,'s1',{...proposal(),requiredEvidence:'NONE'}),BadRequestException);await assert.rejects(()=>svc.propose(adminA,'s1',{...proposal('CLOSED')}),BadRequestException);assert.equal(state.proposals.size,0);});
test('missing fresh MFA blocks proposal before any write',async()=>{const {svc,state}=create();state.stepup=false;await assert.rejects(()=>svc.propose(adminA,'s1',proposal()),ForbiddenException);assert.equal(state.proposals.size,0);assert.equal(state.audit.length,0);});
test('proposal is pending and cannot affect stage behavior until second admin approves',async()=>{const {svc,state}=create();const result=await svc.propose(adminA,'s1',proposal());assert.equal(result.status,'PENDING');assert.equal(state.stages.size,0);assert.equal(state.proposals.size,1);assert.equal(state.audit.at(-1).action,'WORKFLOW_POLICY_PROPOSED');});
test('same admin cannot approve or reject their own proposal',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());await assert.rejects(()=>svc.decide(adminA,'s1',p.id,'APPROVE'),ForbiddenException);await assert.rejects(()=>svc.decide(adminA,'s1',p.id,'REJECT'),ForbiddenException);assert.equal(state.stages.size,0);});
test('different org cannot view or approve a workflow proposal',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());await assert.rejects(()=>svc.decide(outsider,'s2',p.id,'APPROVE'),NotFoundException);assert.equal(state.stages.size,0);assert.equal((await svc.changes(outsider,'s2')).changes.length,0);});
test('pending proposal for same stage blocks duplicate changes and stale version',async()=>{const {svc,state}=create();await svc.propose(adminA,'s1',proposal());await assert.rejects(()=>svc.propose(adminB,'s2',proposal()),ConflictException);assert.equal(state.proposals.size,1);});
test('current independent admin approves and updates exactly one version with audit',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());const result=await svc.decide(adminB,'s2',p.id,'APPROVE');assert.equal(result.applied,true);assert.equal(state.stages.get('org-1|FIELD_INSPECTION').version,1);assert.equal(state.stages.get('org-1|FIELD_INSPECTION').additional_evidence_type,'DOCUMENT');assert.equal(state.audit.at(-1).action,'WORKFLOW_POLICY_APPROVED');});
test('independent rejection is audited without activating change',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());await svc.decide(adminB,'s2',p.id,'REJECT');assert.equal(state.stages.size,0);assert.equal(state.proposals.get(p.id).status,'REJECTED');assert.equal(state.audit.at(-1).action,'WORKFLOW_POLICY_REJECTED');});
test('revoked proposer loses approval eligibility',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());state.proposerActive=false;await assert.rejects(()=>svc.decide(adminB,'s2',p.id,'APPROVE'),ForbiddenException);assert.equal(state.stages.size,0);});
test('stale revision is rejected after stage policy changes',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());state.stages.set('org-1|FIELD_INSPECTION',{version:9});await assert.rejects(()=>svc.decide(adminB,'s2',p.id,'APPROVE'),ConflictException);assert.equal(state.audit.length,1);});
test('policy approval serializes by advisory lock and row lock, and all data is tenant keyed',async()=>{const {svc,state}=create();const p=await svc.propose(adminA,'s1',proposal());await svc.decide(adminB,'s2',p.id,'APPROVE');const s=state.sql.map(q=>q.sql).join(' ');assert.match(s,/pg_advisory_xact_lock/);assert.match(s,/FOR UPDATE/);assert.match(s,/WHERE id=\$1 AND organization_id=\$2/);});
test('denies read for suspended or downgraded administrator',async()=>{const {svc,state}=create();state.adminRead=false;await assert.rejects(()=>svc.stages(adminA,'s1'),ForbiddenException);assert.equal(state.stages.size,0);});
