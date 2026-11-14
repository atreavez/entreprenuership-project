'use strict';
/** Runs the actual compiled AuthGuard and MFA-disable method with controlled adapters. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
class ForbiddenException extends Error{}class UnauthorizedException extends Error{}class ConflictException extends Error{}class BadRequestException extends Error{}class ServiceUnavailableException extends Error{};
const decorator=()=>()=>{};
const nest={ForbiddenException,UnauthorizedException,ConflictException,BadRequestException,ServiceUnavailableException,Body:decorator,Controller:decorator,Delete:decorator,Get:decorator,Injectable:decorator,Module:decorator,Post:decorator,Req:decorator,Res:decorator,UseGuards:decorator};
const src=path.resolve(__dirname,'../../apps/api/src');
function load(filename,imports={}){const file=path.join(src,filename);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:spec=>{if(spec in imports)return imports[spec];throw Error('Unexpected '+spec)},process:{env:{}},Buffer,Date,console},{filename:file,timeout:5000});return module.exports;}
const policy=load('contexts/identity/domain/coadmin-policy.ts');
const {AuthGuard,AuthenticationService}=load('auth.ts',{
 '@nestjs/common':nest,'@nestjs/jwt':{JwtModule:{register:()=>({})}},'argon2':{hash:async()=>'',verify:async()=>true,argon2id:2},'node:crypto':{randomBytes:()=>({toString:()=>''})},'@nestjs/throttler':{Throttle:decorator},
 './database':{},'./contexts/identity/domain/coadmin-policy':policy,'./common':{uid:()=>'',text:x=>x,hash:x=>x},'./audit':{AuditService:class{}},
 './contexts/identity/application/session-usecases':{SessionUseCases:class{}},'./contexts/identity/infrastructure/pg-session.repository':{PgSessionRepository:class{}},
 './contexts/identity/infrastructure/login-abuse.service':{LoginAbuseService:class{}},
 './contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true}, './contexts/identity/domain/identity-policy':{validateNewPassword:()=>{}}
});
function fixture(pathname,{required=true,mfa=false,authorized=true}={}){
 const request={path:pathname,headers:{authorization:'Bearer validtoken'}};
 const guard=new AuthGuard({lookup:async()=>({id:'a',organizationId:'o',role:required?'ORG_ADMIN':'CLIENT',adminMfaRequired:required})},{verifyAsync:async()=>({sub:'a',org:'o',sid:'s'})},{useCases:{authorize:async()=>authorized}},{query:async()=>({rows:[{enabled:mfa,mfa_verified_at:mfa?new Date():null}]})});
 const ctx={switchToHttp:()=>({getRequest:()=>request})};
 return {guard,ctx,request};
}
test('pending privileged administrator cannot read protected workspace records',async()=>{
 for(const route of ['/api/v1/team/members','/api/v1/cases','/api/v1/documents','/api/v1/audit','/api/v1/auth/mfa/disable']){
  const f=fixture(route);await assert.rejects(()=>f.guard.canActivate(f.ctx),ForbiddenException);
 }
});
test('pending privileged administrator may enroll and confirm MFA only',async()=>{
 for(const route of ['/api/v1/auth/me','/api/v1/auth/mfa/status','/api/v1/auth/mfa/enroll','/api/v1/auth/mfa/confirm','/api/v1/auth/logout']){
  const f=fixture(route);assert.equal(await f.guard.canActivate(f.ctx),true);assert.equal(f.request.sessionId,'s');
 }
});
test('MFA-confirmed coadministrator can access workspace but revoked session remains rejected',async()=>{
 const f=fixture('/api/v1/cases',{mfa:true});assert.equal(await f.guard.canActivate(f.ctx),true);
 const expired=fixture('/api/v1/cases',{mfa:true,authorized:false});await assert.rejects(()=>expired.guard.canActivate(expired.ctx),UnauthorizedException);
});
test('nonprivileged roles are not subjected to coadministrator enrollment restriction',async()=>{
 const f=fixture('/api/v1/cases',{required:false,mfa:false});assert.equal(await f.guard.canActivate(f.ctx),true);
});
test('an active coadministrator cannot disable mandatory MFA',async()=>{
 const operations=[];
 const db={transaction:async f=>f({query:async sql=>{operations.push(sql);if(sql.includes('SELECT admin_mfa_required,role FROM users'))return {rows:[{admin_mfa_required:true,role:'ORG_ADMIN'}]};throw Error('Should not touch MFA credential: '+sql)}})};
 const service=new AuthenticationService(db,{},{});
 service.assertPassword=async()=>{};
 await assert.rejects(()=>service.disableMfa({id:'a',organizationId:'o',role:'ORG_ADMIN'},'s',{currentPassword:'any'}),ForbiddenException);
 assert.equal(operations.length,1);assert.match(operations[0],/FOR SHARE/);
});
test('session header remains mandatory for MFA enrollment routes',async()=>{
 const f=fixture('/api/v1/auth/mfa/enroll');delete f.request.headers.authorization;
 await assert.rejects(()=>f.guard.canActivate(f.ctx),UnauthorizedException);
});
