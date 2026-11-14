'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');const vm=require('node:vm');
const crypto=require('node:crypto');const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}class ConflictException extends Error{}class NotFoundException extends Error{}class BadRequestException extends Error{};
const decorate=()=>()=>{};
const nest={ForbiddenException,ConflictException,NotFoundException,BadRequestException,Controller:decorate,Get:decorate,Post:decorate,Req:decorate,UseGuards:decorate,Injectable:decorate,Module:decorate,Body:decorate,Param:decorate};
function load(file,imports={}){const filename=path.join(root,file);const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected module '+id)},console,Date,Set,Buffer},{filename,timeout:5000});return mod.exports;}
const policy=load('contexts/identity/domain/coadmin-policy.ts');
const current=load('contexts/identity/infrastructure/current-admin-step-up.ts',{'@nestjs/common':nest});
let counter=0;
const common={uid:()=>`uuid-${++counter}`,hash:x=>crypto.createHash('sha256').update(x).digest('hex'),text:(x,label)=>{if(typeof x!=='string'||!x.trim())throw new BadRequestException(label);return x.trim()},enumValue:(v,roles)=>{if(!roles.includes(v))throw new BadRequestException('Role not allowed');return v},assertRole:(u,r)=>{if(!r.includes(u.role))throw new ForbiddenException('Role')},isUuid:x=>x};
const {TeamService}=load('team.ts',{
 '@nestjs/common':nest,'node:crypto':crypto,'@nestjs/throttler':{Throttle:decorate},
 './contexts/identity/domain/coadmin-policy':policy,'./contexts/identity/infrastructure/current-admin-step-up':current,
 './contexts/identity/domain/identity-policy':{validateNewPassword:()=>{}},
 argon2:{default:{hash:async()=> 'argon2-test-hash',argon2id:2},hash:async()=> 'argon2-test-hash',argon2id:2},'./database':{},
 './auth':{AuthGuard:class{},AuthModule:class{}},'./audit':{AuditModule:class{}},'./common':common
});
const actor={id:'admin1',organizationId:'org1',role:'ORG_ADMIN',email:'a@org.test',fullName:'Owner'};
function fake({roleValid=true,sessionValid=true,sponsorValid=true,inviteAccepted=false,expired=false,revoked=false}={}){
 const state={invitations:[],users:[],events:[],sql:[],roleValid,sessionValid,sponsorValid};
 const db={transaction:async f=>f({query:async(sql,args=[])=>{
  state.sql.push({sql,args});
  if(sql.includes('FROM users u\n  JOIN auth_sessions'))return {rows:state.roleValid&&state.sessionValid?[{id:actor.id}]:[]};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('SELECT 1 FROM users WHERE email'))return {rows:state.users.some(u=>u.email===args[0])?[{}]:[]};
  if(sql.includes('FROM team_invitations WHERE organization_id='))return {rows:state.invitations.some(x=>x.email===args[1]&&!x.accepted_at&&!x.revoked_at)?[{}]:[]};
  if(sql.includes('INSERT INTO team_invitations')){state.invitations.push({id:args[0],organization_id:args[1],email:args[2],role:'ORG_ADMIN',token_hash:args[3],expires_at:args[4],created_by:args[5],accepted_at:null,revoked_at:null});return {rows:[],rowCount:1};}
  if(sql.includes("FROM team_invitations WHERE token_hash=$1 AND role='ORG_ADMIN'")){
   const existing=state.invitations.find(x=>x.token_hash===args[0]);if(existing){if(expired)existing.expires_at='2000-01-01';if(revoked)existing.revoked_at=new Date();if(inviteAccepted)existing.accepted_at=new Date();}return {rows:existing?[existing]:[]};
  }
  if(sql.includes('FROM users u JOIN auth_mfa_credentials'))return {rows:sponsorValid?[{id:'admin1'}]:[]};
  if(sql.includes('INSERT INTO users(id,organization_id,full_name,email,password_hash,role,professional_approved,admin_mfa_required)')){state.users.push({id:args[0],organization_id:args[1],email:args[3],admin_mfa_required:true,role:'ORG_ADMIN'});return {rows:[],rowCount:1};}
  if(sql.includes('UPDATE team_invitations SET accepted_at')){const i=state.invitations.find(x=>x.id===args[0]);i.accepted_at=new Date();i.accepted_by=args[1];return {rows:[],rowCount:1};}
  if(sql.includes('UPDATE team_invitations SET revoked_at')){const i=state.invitations.find(x=>x.id===args[0]&&!x.accepted_at&&!x.revoked_at);if(i){i.revoked_at=new Date();return {rows:[{email:i.email}],rowCount:1}}return {rows:[],rowCount:0};}
  if(sql.includes("FROM team_invitations WHERE token_hash=$1 AND role<>'ORG_ADMIN'"))return {rows:[],rowCount:0};
  throw Error('Unhandled SQL '+sql);
  }}),query:async()=>({rows:[]})};
 const audit={write:async(_tx,_user,action,_type,_id,details)=>state.events.push({action,details})};
 return {svc:new TeamService(db,audit),state};
}
test('current admin step-up is required; no invitation or audit on denial',async()=>{
 for(const flags of [{roleValid:false},{sessionValid:false}]){const x=fake(flags);await assert.rejects(()=>x.svc.inviteCoAdmin(actor,'session1',{email:'second@org.test'}),ForbiddenException);assert.equal(x.state.invitations.length,0);assert.equal(x.state.events.length,0);}
});
test('only a short-lived hashed one-time token is persisted, with a coadmin audit event',async()=>{
 const x=fake();const out=await x.svc.inviteCoAdmin(actor,'session1',{email:'Second@Org.test'});
 assert.equal(out.role,'ORG_ADMIN');assert.ok(out.inviteToken.length>=40);
 const stored=x.state.invitations[0];assert.equal(stored.email,'second@org.test');assert.notEqual(stored.token_hash,out.inviteToken);
 assert.equal(stored.token_hash,crypto.createHash('sha256').update(out.inviteToken).digest('hex'));
 assert.equal(x.state.events[0].action,'COADMIN_INVITED');assert.ok(!JSON.stringify(x.state.events).includes(out.inviteToken));
 assert.ok(new Date(out.expiresAt).getTime()-Date.now()<=3600_1000);
});
test('privileged invite acceptance sets required MFA, is one-time, and writes audit evidence',async()=>{
 const x=fake();const out=await x.svc.inviteCoAdmin(actor,'session1',{email:'second@org.test'});
 const result=await x.svc.acceptCoAdmin({token:out.inviteToken,fullName:'Second Administrator',password:'Secure Password 123!'});
 assert.equal(result.ok,true);assert.equal(x.state.users.length,1);assert.equal(x.state.users[0].admin_mfa_required,true);
 assert.equal(x.state.invitations[0].accepted_by,x.state.users[0].id);
 assert.equal(x.state.events.at(-1).action,'COADMIN_INVITE_ACCEPTED');
 await assert.rejects(()=>x.svc.acceptCoAdmin({token:out.inviteToken,fullName:'Replay',password:'Secure Password 123!'}),BadRequestException);
 assert.equal(x.state.users.length,1);
});
test('expired/revoked invitations and sponsor downgrade cannot be accepted',async()=>{
 for(const flags of [{expired:true},{revoked:true},{sponsorValid:false}]){
  const x=fake(flags);const out=await x.svc.inviteCoAdmin(actor,'session1',{email:'second@org.test'});
  await assert.rejects(()=>x.svc.acceptCoAdmin({token:out.inviteToken,fullName:'Second',password:'Secure Password 123!'}));
  assert.equal(x.state.users.length,0);
 }
});
test('ordinary team-accept endpoint cannot redeem a privileged co-admin token',async()=>{
 const x=fake();const out=await x.svc.inviteCoAdmin(actor,'session1',{email:'second@org.test'});
 await assert.rejects(()=>x.svc.accept({token:out.inviteToken,fullName:'Second',password:'Secure Password 123!'}),BadRequestException);
 assert.equal(x.state.users.length,0);
});
test('revoke requires fresh current administrator step-up and prevents redemption',async()=>{
 const x=fake();const out=await x.svc.inviteCoAdmin(actor,'session1',{email:'second@org.test'});const id=x.state.invitations[0].id;
 x.state.sessionValid=false;await assert.rejects(()=>x.svc.revokeCoAdminInvitation(actor,'stale',id),ForbiddenException);
 assert.equal(x.state.invitations[0].revoked_at,null);x.state.sessionValid=true;
 assert.equal((await x.svc.revokeCoAdminInvitation(actor,'session1',id)).ok,true);
 assert.equal(x.state.events.at(-1).action,'COADMIN_INVITATION_REVOKED');
 await assert.rejects(()=>x.svc.acceptCoAdmin({token:out.inviteToken,fullName:'Second',password:'Secure Password 123!'}),BadRequestException);
});
test('ordinary invitation endpoint cannot grant the ORG_ADMIN role',async()=>{
 const x=fake();await assert.rejects(()=>x.svc.invite(actor,{email:'third@org.test',role:'ORG_ADMIN'}),BadRequestException);
 assert.equal(x.state.invitations.length,0);
});
test('a duplicate pending co-admin invitation is not silently issued',async()=>{
 const x=fake();await x.svc.inviteCoAdmin(actor,'session1',{email:'third@org.test'});
 await assert.rejects(()=>x.svc.inviteCoAdmin(actor,'session1',{email:'third@org.test'}),ConflictException);
 assert.equal(x.state.invitations.length,1);
});
