'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{} class BadRequestException extends Error{}class ConflictException extends Error{}class NotFoundException extends Error{}
const decorator=()=>()=>{};
const nest={ForbiddenException,BadRequestException,ConflictException,NotFoundException,Body:decorator,Controller:decorator,Get:decorator,Post:decorator,Param:decorator,Req:decorator,UseGuards:decorator,Injectable:decorator,Module:decorator};
const throttle={Throttle:decorator};
let seed=0;
function load(file,imports={}){
 const fileName=path.join(root,file);const js=ts.transpileModule(fs.readFileSync(fileName,'utf8'),{fileName,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw new Error('Unknown import '+n)},console,Date,JSON},{filename:fileName,timeout:4000});return m.exports;
}
const policy=load('contexts/member-management/domain/member-policy.ts');
const current=load('contexts/identity/infrastructure/current-admin-step-up.ts',{'@nestjs/common':nest});
const {MemberManagementService}=load('contexts/member-management/infrastructure/member-management.module.ts',{
 '@nestjs/common':nest,'@nestjs/throttler':throttle,'../../../database':{},'../../../auth':{AuthGuard:class{},AuthModule:class{}},
 '../../../audit':{AuditService:class{},AuditModule:class{}},'../../../common':{uid:()=>`00000000-0000-4000-8000-${String(++seed).padStart(12,'0')}`,isUuid:s=>s},
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},
 '../../identity/infrastructure/current-admin-step-up':current,'../domain/member-policy':policy
});
const adminA={id:'admin-a',organizationId:'org-one',role:'ORG_ADMIN'};
const adminB={id:'admin-b',organizationId:'org-one',role:'ORG_ADMIN'};
const outside={id:'admin-c',organizationId:'org-two',role:'ORG_ADMIN'};
const subjectId='member-a';
const simpleUser=(id,organizationId,role)=>({id,organization_id:organizationId,role,suspended_at:null,professional_approved:role==='SURVEYOR'});
function setup(options={}){
 const state={users:new Map([['admin-a',simpleUser('admin-a','org-one','ORG_ADMIN')],['admin-b',simpleUser('admin-b','org-one','ORG_ADMIN')],['admin-c',simpleUser('admin-c','org-two','ORG_ADMIN')],[subjectId,simpleUser(subjectId,'org-one','CLIENT')],['member-out',simpleUser('member-out','org-two','CLIENT')]]),proposals:new Map(),events:[],queries:[],steps:options.stepUp!==false,sessionsRevoked:[],closedCasesUnassigned:[],accreditationRevoked:[]};
 async function query(sql,args=[]){state.queries.push({sql,args});
  if(sql.includes('JOIN auth_mfa_credentials'))return {rows:state.steps?[{id:args[0]}]:[]};
  if(sql.includes('JOIN auth_sessions')&&sql.includes('FOR SHARE'))return {rows:state.steps?[{id:args[0]}]:[]};
  if(sql.includes('SELECT id,organization_id,role,suspended_at FROM users')){const u=state.users.get(args[0]);return {rows:u&&u.organization_id===args[1]?[{...u}]:[]};}
  if(sql.includes('SELECT id FROM member_role_proposals')&&sql.includes("status='PENDING'")){const p=[...state.proposals.values()].find(x=>x.organization_id===args[0]&&x.target_user_id===args[1]&&x.status==='PENDING');return {rows:p?[{id:p.id}]:[]};}
  if(sql.includes('INSERT INTO member_role_proposals')){const [id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by]=args;state.proposals.set(id,{id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by,status:'PENDING'});return {rows:[],rowCount:1};}
  if(sql.includes('FROM member_role_proposals WHERE id=$1')||sql.includes('FROM member_role_proposals WHERE id=$1 AND')){const p=state.proposals.get(args[0]);return {rows:p&&p.organization_id===args[1]?[{...p}]:[]};}
  if(sql.includes('SELECT id FROM users WHERE id=$1')&&sql.includes("role='ORG_ADMIN'")){const u=state.users.get(args[0]);return {rows:u&&u.organization_id===args[1]&&u.role==='ORG_ADMIN'&&!u.suspended_at?[{id:u.id}]:[]};}
  if(sql.includes('UPDATE professional_accreditations')){state.accreditationRevoked.push(args[0]);return {rows:[],rowCount:1};}
  if(sql.includes('UPDATE users SET role=$3')){const u=state.users.get(args[0]);if(!u||u.organization_id!==args[1]||u.role!==args[3]||u.suspended_at)return {rows:[]};u.role=args[2];u.professional_approved=false;return {rows:[{id:u.id}],rowCount:1};}
  if(sql.includes('UPDATE verification_cases')){state.closedCasesUnassigned.push(args[1]);return {rows:[],rowCount:2};}
  if(sql.includes('UPDATE auth_sessions')){state.sessionsRevoked.push(args[0]);return {rows:[],rowCount:2};}
  if(sql.includes('UPDATE member_role_proposals SET status=$2')){const p=state.proposals.get(args[0]);p.status=args[1];p.decided_by=args[2];return {rows:[],rowCount:1};}
  if(sql.includes("UPDATE member_role_proposals SET status='CANCELLED'")){for(const p of state.proposals.values()){if(p.organization_id===args[0]&&p.target_user_id===args[2]&&p.status==='PENDING')p.status='CANCELLED'}return {rows:[],rowCount:1};}
  if(sql.includes('UPDATE users SET suspended_at=now()')){const u=state.users.get(args[0]);u.suspended_at=new Date();u.suspended_by=args[2];u.suspension_reason=args[3];return {rows:[],rowCount:1};}
  if(sql.includes('UPDATE users SET suspended_at=NULL')){const u=state.users.get(args[0]);u.suspended_at=null;return {rows:[],rowCount:1};}
  if(sql.includes('SELECT u.id,u.full_name,u.email,u.role'))return {rows:[...state.users.values()].filter(x=>x.organization_id===args[0])};
  if(sql.includes('FROM member_role_proposals p JOIN users u'))return {rows:[...state.proposals.values()].filter(p=>p.organization_id===args[0])};
  throw Error('Unhandled SQL '+sql);
 }
 const db={transaction:async callback=>callback({query})};
 const audit={write:async(tx,actor,action,type,id,detail)=>state.events.push({actor,action,id,detail})};
 return {svc:new MemberManagementService(db,audit),state};
}
const reason='Documented staffing change requested by organization leadership.';
test('domain strictly separates ORG_ADMIN from ordinary roles',()=>{assert.equal(policy.assertNonAdminRole('CLIENT'),'CLIENT');assert.throws(()=>policy.assertNonAdminRole('ORG_ADMIN'));assert.throws(()=>policy.assertNonAdminRole('PLATFORM_SUPER_ADMIN'));assert.throws(()=>policy.assertNonAdminRole('unknown'))});
test('role changes require an actual change and cannot be self-service',()=>{assert.throws(()=>policy.assertTargetRoleChange('u',{id:'u',role:'CLIENT'},'REVIEWER'));assert.throws(()=>policy.assertTargetRoleChange('a',{id:'b',role:'CLIENT'},'CLIENT'));assert.throws(()=>policy.assertTargetRoleChange('a',{id:'b',role:'ORG_ADMIN'},'CLIENT'));});
test('suspension policy blocks self lockout and privileged lifecycle bypass',()=>{assert.throws(()=>policy.assertMemberStateChange('u',{id:'u',role:'CLIENT'},'SUSPEND'));assert.throws(()=>policy.assertMemberStateChange('a',{id:'b',role:'ORG_ADMIN'},'SUSPEND'));assert.equal(policy.assertMemberStateChange('a',{id:'b',role:'CLIENT'},'SUSPEND'),'SUSPEND');});
test('mandatory reason and decision validation is independent of API inputs',()=>{assert.throws(()=>policy.assertReason('too short'));assert.throws(()=>policy.assertReason('x'.repeat(501)));assert.equal(policy.assertDecision('REJECT'),'REJECT');assert.throws(()=>policy.assertDecision('AUTO_APPROVE'));});
test('member directory excludes other organizations and returns no credentials',async()=>{const x=setup();const r=await x.svc.list(adminA,'sid');assert.equal(r.members.length,3);assert.ok(r.members.every(m=>m.organization_id==='org-one'));assert.ok(!JSON.stringify(r).includes('password_hash'));});
test('role change remains pending with no immediate privilege change',async()=>{const x=setup();const result=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});assert.equal(result.status,'PENDING');assert.equal(x.state.users.get(subjectId).role,'CLIENT');assert.equal(x.state.events.at(-1).action,'MEMBER_ROLE_PROPOSED')});
test('role proposal requires fresh MFA',async()=>{const x=setup({stepUp:false});await assert.rejects(()=>x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason}),ForbiddenException);assert.equal(x.state.proposals.size,0)});
test('cross-tenant role proposal cannot find target or change it',async()=>{const x=setup();await assert.rejects(()=>x.svc.proposeRole(outside,'sid',subjectId,{role:'REVIEWER',reason}),NotFoundException);assert.equal(x.state.events.length,0)});
test('administrator cannot assign ORG_ADMIN via normal role changes',async()=>{const x=setup();await assert.rejects(()=>x.svc.proposeRole(adminA,'sid',subjectId,{role:'ORG_ADMIN',reason}),BadRequestException);assert.equal(x.state.proposals.size,0)});
test('one pending role proposal per member',async()=>{const x=setup();await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});await assert.rejects(()=>x.svc.proposeRole(adminB,'sid',subjectId,{role:'SURVEYOR',reason}),ConflictException)});
test('author cannot approve own privileged role change',async()=>{const x=setup();const p=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});await assert.rejects(()=>x.svc.decideRole(adminA,'sid',p.id,'APPROVE'),ForbiddenException);assert.equal(x.state.users.get(subjectId).role,'CLIENT')});
test('second admin approves role change, resets vetting and revokes sessions',async()=>{const x=setup();const p=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'SURVEYOR',reason});const result=await x.svc.decideRole(adminB,'sid2',p.id,'APPROVE');assert.equal(result.status,'APPROVED');assert.equal(x.state.users.get(subjectId).role,'SURVEYOR');assert.equal(x.state.users.get(subjectId).professional_approved,false);assert.deepEqual(x.state.sessionsRevoked,[subjectId]);assert.deepEqual(x.state.accreditationRevoked,[subjectId]);assert.deepEqual(x.state.closedCasesUnassigned,[subjectId]);assert.equal(x.state.events.at(-1).action,'MEMBER_ROLE_APPROVED')});
test('second admin rejects proposal without changing role or sessions',async()=>{const x=setup();const p=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'SURVEYOR',reason});const r=await x.svc.decideRole(adminB,'sid',p.id,'REJECT');assert.equal(r.status,'REJECTED');assert.equal(x.state.users.get(subjectId).role,'CLIENT');assert.equal(x.state.sessionsRevoked.length,0)});
test('stale role change after independently changed user fails closed',async()=>{const x=setup();const p=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});x.state.users.get(subjectId).role='SURVEYOR';await assert.rejects(()=>x.svc.decideRole(adminB,'sid',p.id,'APPROVE'),ConflictException);assert.equal(x.state.sessionsRevoked.length,0)});
test('a downgraded proposer cannot have pending proposal approved',async()=>{const x=setup();const p=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});x.state.users.get(adminA.id).role='CLIENT';await assert.rejects(()=>x.svc.decideRole(adminB,'sid',p.id,'APPROVE'),ForbiddenException)});
test('outsider cannot read or decide role proposals in another tenant',async()=>{const x=setup();const p=await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});await assert.rejects(()=>x.svc.decideRole(outside,'sid',p.id,'APPROVE'),NotFoundException);assert.equal((await x.svc.proposals(outside,'sid')).changes.length,0)});
test('suspending member immediately revokes sessions and cancels pending changes',async()=>{const x=setup();await x.svc.proposeRole(adminA,'sid',subjectId,{role:'REVIEWER',reason});const result=await x.svc.changeStatus(adminB,'sid',subjectId,{action:'SUSPEND',reason});assert.equal(result.status,'SUSPENDED');assert.ok(x.state.users.get(subjectId).suspended_at);assert.deepEqual(x.state.sessionsRevoked,[subjectId]);assert.equal([...x.state.proposals.values()][0].status,'CANCELLED')});
test('suspended user cannot get new role proposal',async()=>{const x=setup();await x.svc.changeStatus(adminA,'sid',subjectId,{action:'SUSPEND',reason});await assert.rejects(()=>x.svc.proposeRole(adminB,'sid',subjectId,{role:'REVIEWER',reason}),BadRequestException)});
test('restoring member leaves previous sessions invalidated',async()=>{const x=setup();await x.svc.changeStatus(adminA,'sid',subjectId,{action:'SUSPEND',reason});const r=await x.svc.changeStatus(adminB,'sid',subjectId,{action:'RESTORE',reason});assert.equal(r.status,'ACTIVE');assert.equal(x.state.users.get(subjectId).suspended_at,null);assert.deepEqual(x.state.sessionsRevoked,[subjectId])});
test('ordinary workflow cannot suspend an admin or self',async()=>{const x=setup();await assert.rejects(()=>x.svc.changeStatus(adminA,'sid','admin-b',{action:'SUSPEND',reason}),BadRequestException);await assert.rejects(()=>x.svc.changeStatus(adminA,'sid','admin-a',{action:'SUSPEND',reason}),BadRequestException)});
test('role catalog advertises no unrestricted professional approvals',async()=>{const x=setup();const r=await x.svc.catalog(adminA,'sid');assert.equal(r.roles.length,5);assert.ok(r.roles.some(role=>role.role==='ORG_ADMIN'&&role.grantPath.includes('co-administrator')));assert.ok(r.policy.includes('not yet supported'))});
test('database schema enforces organization-matching target and administrator references',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../apps/api/sql/010_member_management.sql'),'utf8');
 for(const name of ['member_proposal_target_tenant','member_proposal_proposer_tenant','member_proposal_decider_tenant'])assert.ok(sql.includes(name));
 assert.match(sql,/CHECK \(proposed_role IN \('CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'\)\)/);
 assert.match(sql,/member_one_pending_role_change/);
});
