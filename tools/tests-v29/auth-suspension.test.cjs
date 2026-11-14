'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class UnauthorizedException extends Error{} class ForbiddenException extends Error{}class BadRequestException extends Error{}
const dec=()=>()=>{};
const common={UnauthorizedException,ForbiddenException,BadRequestException,ConflictException:class extends Error{},ServiceUnavailableException:class extends Error{},Controller:dec,Body:dec,Delete:dec,Get:dec,Injectable:dec,Module:dec,Post:dec,Req:dec,Res:dec,UseGuards:dec};
const name=path.join(root,'auth.ts');
const code=ts.transpileModule(fs.readFileSync(name,'utf8'),{fileName:name,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText;
function authFixture({suspended=true}={}){
 let verifications=0,sql=[];
 const deps={
  '@nestjs/common':common,'@nestjs/jwt':{JwtModule:{register:()=>({})}},'@nestjs/throttler':{Throttle:dec},
  'argon2':{verify:async()=>{verifications++;return true;},hash:async()=>'',argon2id:2},
  './database':{},'./audit':{},'./common':{uid:()=>'',text:v=>v,hash:v=>v},
  './contexts/identity/application/session-usecases':{},'./contexts/identity/infrastructure/pg-session.repository':{},'./contexts/identity/infrastructure/login-abuse.service':{LoginAbuseService:class{}},
  './contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true},
  './contexts/identity/domain/coadmin-policy':{isCoAdminEnrollmentRoute:()=>false,requiresAdminMfa:(role,flag)=>role==='ORG_ADMIN'||flag===true,hasAdminSessionMfaProof:(enabled,verifiedAt)=>enabled===true&&verifiedAt!=null},'./contexts/identity/domain/identity-policy':{hashOpaque:x=>x} };
 const mod={exports:{}};
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>deps[n]||require(n),process:{env:{}},Buffer,Date,console},{timeout:5000,filename:name});
 const db={query:async (query)=>{
  sql.push(query);
  if(query.includes('FROM users u LEFT JOIN auth_mfa_credentials'))return {rows:[{id:'member',organization_id:'org',full_name:'Member',email:'m@e.test',role:'CLIENT',password_hash:'valid-hash',suspended_at:suspended?new Date():null,mfa_enabled:false}]};
  if(query.includes('FROM users u WHERE u.id'))return {rows:[]};
  throw Error('unexpected query '+query);
 },transaction:async fn=>fn({query:async query=>{sql.push(query);
  if(query.includes('FROM users u WHERE u.id=$1'))return {rows:[{password_hash:'valid-hash',suspended_at:suspended?new Date():null,role:'CLIENT',admin_mfa_required:false}]};
  if(query.includes('SELECT enabled FROM auth_mfa_credentials'))return {rows:[]};
  if(query.includes('SELECT user_id FROM auth_login_challenges'))return {rows:[{user_id:'member'}]};
  if(query.includes('SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR SHARE'))return {rows:suspended?[]:[{id:'member'}]};
  return {rows:[]};
 }})};
 const service=new mod.exports.AuthenticationService(db,{useCases:{}},{});
 service.publicSession=async()=>({accessToken:'ok'});
 return {service,sql,verifications:()=>verifications};
}
test('suspended account with correct password is rejected after Argon2 verification',async()=>{
 const x=authFixture();await assert.rejects(()=>x.service.login({email:'m@e.test',password:'longsecret'}),UnauthorizedException);
 assert.equal(x.verifications(),1);assert.ok(x.sql.some(s=>s.includes('u.suspended_at')));
});
test('active account retains existing login behavior',async()=>{
 const x=authFixture({suspended:false});const r=await x.service.login({email:'m@e.test',password:'longsecret'});assert.equal(r.accessToken,'ok');assert.equal(x.verifications(),1);
});
test('authentication lookup excludes suspended records for existing access and refresh sessions',async()=>{
 const x=authFixture();await assert.rejects(()=>x.service.lookup('member','org'),UnauthorizedException);
 assert.ok(x.sql.find(s=>s.includes('FROM users u WHERE u.id')&&s.includes('u.suspended_at IS NULL')));
});
test('pending MFA challenges cannot complete after an account is suspended',async()=>{
 const x=authFixture();await assert.rejects(()=>x.service.completeMfa({challengeToken:'challenge',code:'000000'}),UnauthorizedException);
 assert.ok(x.sql.find(s=>s.includes('SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL FOR SHARE')));
});
test('current administrator step-up must check member is not suspended',()=>{
 const source=fs.readFileSync(path.join(root,'contexts/identity/infrastructure/current-admin-step-up.ts'),'utf8');
 assert.match(source,/u\.role='ORG_ADMIN' AND u\.suspended_at IS NULL/);
});
