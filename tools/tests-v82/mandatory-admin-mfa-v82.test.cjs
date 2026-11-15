'use strict';
/** Execute transpiled application classes with narrow SQL/Nest stubs. Not live integration. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const ROOT=path.resolve(__dirname,'../..'),decorator=()=>()=>{};
class UnauthorizedException extends Error{}class ForbiddenException extends Error{}class BadRequestException extends Error{}class ConflictException extends Error{}class ServiceUnavailableException extends Error{}
const nest={UnauthorizedException,ForbiddenException,BadRequestException,ConflictException,ServiceUnavailableException,Body:decorator,Controller:decorator,Delete:decorator,Get:decorator,Injectable:decorator,Module:decorator,Post:decorator,Req:decorator,Res:decorator,UseGuards:decorator};
function load(relative,imports={}){
 const filename=path.join(ROOT,'apps/api/src',relative);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(Object.hasOwn(imports,name))return imports[name];if(name.startsWith('node:'))return require(name);throw Error('Unexpected import '+name);},Buffer,Date,Set,console,process:{env:{NODE_ENV:'test'}}},{filename,timeout:5000});
 return module.exports;
}
const policy=load('contexts/identity/domain/coadmin-policy.ts');
const {AuthGuard,AuthenticationService}=load('auth.ts',{
 '@nestjs/common':nest,'@nestjs/jwt':{JwtModule:{register:()=>({})}},'@nestjs/throttler':{Throttle:decorator},
 'argon2':{hash:async()=> 'argon2-hash',verify:async()=>true,argon2id:2},
 './database':{},'./audit':{},'./common':{uid:()=> 'fake-uuid',text:value=>value,hash:value=>value},
 './contexts/identity/application/session-usecases':{SessionUseCases:class{}},
 './contexts/identity/infrastructure/pg-session.repository':{PgSessionRepository:class{}},
 './contexts/identity/infrastructure/login-abuse.service':{LoginAbuseService:class{}},
 './contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true},
 './contexts/identity/domain/coadmin-policy':policy,
 './contexts/identity/domain/identity-policy':{validateNewPassword:()=>{},isValidRecoveryCode:()=>false}
});
for(const [role,flag,expected] of [['ORG_ADMIN',false,true],['ORG_ADMIN',true,true],['ORG_ADMIN',undefined,true],['CLIENT',false,false],['REVIEWER',false,false],['SURVEYOR',false,false],['LEGAL_REVIEWER',false,false],['CLIENT',true,true]])test(`role ${role} flagged ${String(flag)} requires MFA: ${expected}`,()=>assert.equal(policy.requiresAdminMfa(role,flag),expected));
for(const [enabled,proof,expected] of [[true,new Date(),true],[true,null,false],[false,new Date(),false],[undefined,null,false]])test(`session MFA evidence enabled=${String(enabled)} proof=${String(proof)} => ${expected}`,()=>assert.equal(policy.hasAdminSessionMfaProof(enabled,proof),expected));
function fixture({role='ORG_ADMIN',flag=false,mfa=false,proof=null,rowsExist=true,authorized=true,pathname='/api/v1/assets'}={}){
 const queries=[],request={headers:{authorization:'Bearer test-token'},path:pathname};
 const guard=new AuthGuard({lookup:async()=>({id:'u',organizationId:'o',role,adminMfaRequired:flag})},{verifyAsync:async()=>({sub:'u',org:'o',sid:'session-82'})},{useCases:{authorize:async()=>authorized}},{query:async(sql,params)=>{queries.push({sql,params});return {rows:rowsExist?[{enabled:mfa,mfa_verified_at:proof}]:[]};}});
 return {guard,ctx:{switchToHttp:()=>({getRequest:()=>request})},queries,request};
}
for(const endpoint of ['/api/v1/assets','/api/v1/cases','/api/v1/admin-control/settings','/api/v1/documents'])test(`legacy administrator without MFA denied ${endpoint}`,async()=>{const x=fixture({pathname:endpoint});await assert.rejects(()=>x.guard.canActivate(x.ctx),ForbiddenException);assert.equal(x.queries.length,1);});
test('new founder may only access safe MFA enrollment routes',async()=>{for(const endpoint of ['/api/v1/auth/me','/api/v1/auth/mfa/enroll','/api/v1/auth/mfa/confirm']){const x=fixture({pathname:endpoint});assert.equal(await x.guard.canActivate(x.ctx),true);}});
test('enabled MFA on another session does not prove MFA on the current session',async()=>{const x=fixture({mfa:true});await assert.rejects(()=>x.guard.canActivate(x.ctx),ForbiddenException);});
test('verified current session may access admin workspace, and lookup ties it to session/org/user',async()=>{const x=fixture({mfa:true,proof:new Date()});assert.equal(await x.guard.canActivate(x.ctx),true);const {sql,params}=x.queries[0];assert.equal(params[2],'session-82');for(const fragment of ['s.id=$3','s.user_id=u.id','s.organization_id=u.organization_id','s.revoked_at IS NULL','s.absolute_expires_at>now()'])assert.ok(sql.includes(fragment),fragment);});
test('admin session missing from DB is rejected',async()=>{const x=fixture({rowsExist:false,mfa:true,proof:new Date()});await assert.rejects(()=>x.guard.canActivate(x.ctx),UnauthorizedException);});
test('regular client can access without admin MFA',async()=>{const x=fixture({role:'CLIENT'});assert.equal(await x.guard.canActivate(x.ctx),true);assert.equal(x.queries.length,0);});
test('specially MFA-required reviewer must also have current session proof',async()=>{const x=fixture({role:'REVIEWER',flag:true});await assert.rejects(()=>x.guard.canActivate(x.ctx),ForbiddenException);});
test('revoked authentication session rejected before MFA lookup',async()=>{const x=fixture({authorized:false,mfa:true,proof:new Date()});await assert.rejects(()=>x.guard.canActivate(x.ctx),UnauthorizedException);assert.equal(x.queries.length,0);});
test('new organization registration flags mandatory MFA before returning provisional session',async()=>{const queries=[];const db={transaction:async work=>work({query:async(sql,params)=>{queries.push({sql,params});return {rows:[]};}})};const service=new AuthenticationService(db,{useCases:{}},{});service.publicSession=async user=>({user});const result=await service.register({fullName:'A',organization:'B',email:'founder@example.test',password:'longpassword'});const insert=queries.find(x=>x.sql.includes('INSERT INTO users'));assert.match(insert.sql,/admin_mfa_required/);assert.match(insert.sql,/true/i);assert.equal(result.user.adminMfaRequired,true);});
test('existing admin with false legacy DB flag is still required to enroll MFA',async()=>{const db={query:async()=>({rows:[{id:'u',organization_id:'o',full_name:'A',email:'f@example.test',role:'ORG_ADMIN',admin_mfa_required:false,admin_mfa_enrolled:false}]})};const service=new AuthenticationService(db,{useCases:{}},{});const user=await service.lookup('u','o');assert.equal(user.adminMfaRequired,true);});
test('non-admin MFA remains optional',async()=>{const db={query:async()=>({rows:[{id:'u',organization_id:'o',full_name:'A',email:'f@example.test',role:'CLIENT',admin_mfa_required:false,admin_mfa_enrolled:false}]})};const service=new AuthenticationService(db,{useCases:{}},{});const user=await service.lookup('u','o');assert.equal(user.adminMfaRequired,false);});
test('legacy founder cannot disable MFA even if admin_mfa_required=false in DB',async()=>{const sql=[];const db={transaction:async fn=>fn({query:async statement=>{sql.push(statement);if(statement.includes('FROM users WHERE'))return {rows:[{role:'ORG_ADMIN',admin_mfa_required:false}]};throw Error('Must stop before touching MFA credential');}})};const service=new AuthenticationService(db,{},{});service.assertPassword=async()=>{};await assert.rejects(()=>service.disableMfa({id:'u',organizationId:'o',role:'ORG_ADMIN'},'S',{}),ForbiddenException);assert.equal(sql.length,1);assert.match(sql[0],/FOR SHARE/);});
test('UI presents pending MFA onboarding before workspace',()=>{const app=fs.readFileSync(path.join(ROOT,'apps/web/src/App.tsx'),'utf8');assert.match(app,/adminMfaRequired\s*&&\s*!user\.adminMfaEnrolled/);assert.match(app,/RequiredAdminMfa/);});
test('admin refresh rejects old session once MFA was enabled elsewhere',async()=>{
 const statements=[];const db={query:async(sql,params)=>{statements.push({sql,params});return {rows:[{enabled:true,mfa_verified_at:null}]};}};
 const service=new AuthenticationService(db,{},{});
 await assert.rejects(()=>service.assertPrivilegedRefreshAllowed({id:'u',organizationId:'o',role:'ORG_ADMIN'},'s'),UnauthorizedException);
 assert.equal(statements[0].params[0],'s');assert.match(statements[0].sql,/s\.absolute_expires_at>now\(\)/);
});
test('admin refresh succeeds if current session contains matching MFA proof',async()=>{
 const service=new AuthenticationService({query:async()=>({rows:[{enabled:true,mfa_verified_at:new Date()}]})},{},{});
 await service.assertPrivilegedRefreshAllowed({id:'u',organizationId:'o',role:'ORG_ADMIN'},'s');
});
test('founder still enrolling MFA can retain a restricted provisional session across refresh',async()=>{
 const service=new AuthenticationService({query:async()=>({rows:[{enabled:false,mfa_verified_at:null}]})},{},{});
 await service.assertPrivilegedRefreshAllowed({id:'u',organizationId:'o',role:'ORG_ADMIN'},'s');
});
test('refresh with nonexistent administrator database session fails closed',async()=>{
 const service=new AuthenticationService({query:async()=>({rows:[]})},{},{});
 await assert.rejects(()=>service.assertPrivilegedRefreshAllowed({id:'u',organizationId:'o',role:'ORG_ADMIN'},'s'),UnauthorizedException);
});
test('non-admin refresh is unaffected by the administrator MFA session contract',async()=>{
 const service=new AuthenticationService({query:async()=>{throw Error('Must not query MFA for optional client')}},{},{});
 await service.assertPrivilegedRefreshAllowed({id:'u',organizationId:'o',role:'CLIENT'},'s');
});
test('HTTP refresh route checks administrator session MFA after rotating refresh token',()=>{
 const source=fs.readFileSync(path.join(ROOT,'apps/api/src/auth.ts'),'utf8');
 assert.match(source,/const user=await this\.auth\.lookup\(result\.subject\.id,result\.subject\.organizationId\);await this\.auth\.assertPrivilegedRefreshAllowed\(user,result\.sessionId\);return this\.respondSession/);
});
