'use strict';
/** V20 security regression against the actual transpiled TypeScript service and repository.
 * Controlled in-memory query adapter; NOT a PostgreSQL integration test. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const ts=require('../test-typescript-loader.cjs');
const root=path.join(__dirname,'../..');
const fakeDecorator=()=>()=>{};
const NestExceptions={UnauthorizedException:class UnauthorizedException extends Error{},BadRequestException:class BadRequestException extends Error{},ForbiddenException:class ForbiddenException extends Error{},ConflictException:class ConflictException extends Error{},NotFoundException:class NotFoundException extends Error{},ServiceUnavailableException:class ServiceUnavailableException extends Error{}};
const commonNest={Body:fakeDecorator,Controller:fakeDecorator,Delete:fakeDecorator,Get:fakeDecorator,Injectable:fakeDecorator,Module:fakeDecorator,Post:fakeDecorator,Req:fakeDecorator,Res:fakeDecorator,UseGuards:fakeDecorator,Inject:fakeDecorator,...NestExceptions};
function load(relative,additional){
 const src=fs.readFileSync(path.join(root,relative),'utf8');
 const output=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false,esModuleInterop:true}}).outputText;
 const dependencies={'@nestjs/common':commonNest,'@nestjs/jwt':{JwtModule:{register:()=>({})},JwtService:class{}},'@nestjs/throttler':{Throttle:fakeDecorator},'argon2':{verify:async()=>true,hash:async()=>''},'./database':{},'./audit':{},'./common':{uid:crypto.randomUUID,text:v=>v,UserAuth:class{}},'./contexts/identity/application/session-usecases':{},'./contexts/identity/infrastructure/pg-session.repository':{},'./contexts/identity/infrastructure/login-abuse.service':{LoginAbuseService:class{}},'./contexts/identity/domain/coadmin-policy':{isCoAdminEnrollmentRoute:()=>false,requiresAdminMfa:(role,flag)=>role==='ORG_ADMIN'||flag===true,hasAdminSessionMfaProof:(enabled,verifiedAt)=>enabled===true&&verifiedAt!=null},
 './contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true},
 './contexts/identity/domain/identity-policy':{CHALLENGE_TTL_MS:300000,hashOpaque:s=>crypto.createHash('sha256').update(s).digest('hex'),verifyTotp:()=>null,decodeBase32:()=>Buffer.alloc(20),openSecret:()=>'',isValidRecoveryCode:code=>typeof code==='string'&&/^[A-Za-z0-9_-]{14}$/.test(code)},...additional};
 const context={module:{exports:{}},exports:{},Buffer,Date,console,process:{env:{MFA_ENCRYPTION_KEY:'cc'.repeat(32)}},require:id=>Object.hasOwn(dependencies,id)?dependencies[id]:require(id)};
 context.exports=context.module.exports;
 vm.runInNewContext(output,context,{filename:relative,timeout:4000});
 return context.module.exports;
}
function disabledMfaFixture(){
 const recorded=[];
 let mfaEnabled=true;
 let currentStepUpValid=true;
 const userId='user-v20';
 const query=async(sql,params=[])=>{
   recorded.push({sql,params});
   if(sql.includes('SELECT admin_mfa_required,role FROM users'))return {rows:[{admin_mfa_required:false,role:'CLIENT'}]};
   if(sql.includes('SELECT password_hash FROM users'))return {rows:[{password_hash:'hashed'}]};
   if(sql.includes('SELECT id FROM auth_sessions WHERE id=$1'))return {rows:[{id:params?.[0] || 'session-current'}]};
   if(sql.includes('SELECT secret_ciphertext,enabled,last_used_step'))return {rows:[{secret_ciphertext:'encrypted',enabled:mfaEnabled,last_used_step:0}]};
   if(sql.includes('DELETE FROM auth_recovery_codes')&&sql.includes('code_hash'))return {rowCount:1,rows:[{id:'valid-code'}]};
   if(sql.includes('DELETE FROM auth_mfa_credentials')){mfaEnabled=false;return {rows:[],rowCount:1}};
   if(sql.includes('UPDATE auth_sessions SET mfa_verified_at=NULL')){
     assert.equal(params[0],userId);currentStepUpValid=false;return {rows:[],rowCount:1};
   }
   if(sql.includes('UPDATE auth_sessions')||sql.includes('DELETE FROM auth_recovery_codes'))return {rows:[],rowCount:1};
   throw new Error('Unexpected SQL '+sql);
 };
 const db={query,transaction:async fn=>fn({query})};
 const {AuthenticationService}=load('apps/api/src/auth.ts');
 const svc=new AuthenticationService(db,{}, {write:async()=>{}});
 return {svc,recorded,user:{id:userId,organizationId:'org-v20'},get enabled(){return mfaEnabled},get currentStepUpValid(){return currentStepUpValid}};
}
test('RED→GREEN: disabling MFA clears recent step-up status on CURRENT session',async()=>{
 const f=disabledMfaFixture();
 const result=await f.svc.disableMfa(f.user,'session-current',{currentPassword:'StrongPassword123',backupCode:'AbcdEFG123_456'});
 assert.equal(result.enabled,false);
 assert.equal(f.enabled,false);
 assert.equal(f.currentStepUpValid,false,'MFA disable must invalidate step-up on the same still-active session');
 assert.ok(f.recorded.find(x=>/UPDATE auth_sessions SET mfa_verified_at=NULL/.test(x.sql)));
});
test('MFA disable clears verification for all user sessions, not only other sessions',async()=>{
 const f=disabledMfaFixture();await f.svc.disableMfa(f.user,'session-current',{currentPassword:'StrongPassword123',backupCode:'AbcdEFG123_456'});
 const clear=f.recorded.find(x=>x.sql.includes('SET mfa_verified_at=NULL'));
 assert.match(clear.sql,/WHERE user_id=\$1/);
 assert.doesNotMatch(clear.sql,/id<>|id !=|id = /);
});
const parcelSource=fs.readFileSync(path.join(root,'apps/api/src/contexts/geospatial/infrastructure/pg-parcel.repository.ts'),'utf8');
const parcelReviewSql=parcelSource.slice(parcelSource.indexOf('async review('),parcelSource.indexOf('async overlaps('));
test('RED→GREEN: parcel review step-up rechecks active MFA inside the review transaction',()=>{
 assert.match(parcelReviewSql,/JOIN auth_mfa_credentials\s+m\s+ON\s+m\.user_id\s*=\s*s\.user_id/);
 assert.match(parcelReviewSql,/m\.enabled\s*=\s*true/);
 assert.match(parcelReviewSql,/s\.mfa_verified_at\s*>\s*now\(\)\s*-\s*interval\s*'15 minutes'/);
});
test('parcel review locks MFA and session rows to prevent concurrent disable from racing review',()=>{
 assert.match(parcelReviewSql,/FOR SHARE OF s,m/);
 assert.match(parcelReviewSql,/s\.revoked_at IS NULL/);
});
test('professional trust review still requires a live MFA credential',()=>{
 const source=fs.readFileSync(path.join(root,'apps/api/src/contexts/professional-trust/infrastructure/pg-trust.repository.ts'),'utf8');
 assert.match(source,/JOIN auth_mfa_credentials m ON m\.user_id/);
 assert.match(source,/m\.enabled=true/);
});
function parcelReviewFixture(mfaEnabled){
 const statements=[];let reviews=0;
 const db={transaction:async fn=>fn({query:async(sql,params)=>{
  statements.push(sql);
  if(sql.includes('FROM auth_sessions')){
   // Model the authentication lookup result. With the old timestamp-only
   // query, the earlier step-up still appears valid after MFA is disabled.
   const demandsEnabled=sql.includes('auth_mfa_credentials')&&/m\.enabled\s*=\s*true/.test(sql);
   return {rows:(!demandsEnabled||mfaEnabled)?[{present:1}]:[]};
  }
  if(sql.includes('FROM assets'))return {rows:[{id:'asset-20',asset_type:'LAND',created_by:'reviewer-20',role:'SURVEYOR'}]};
  if(sql.includes('FROM parcel_boundary_claims'))return {rows:[{submitted_by:'another-user',status:'SUBMITTED'}]};
  if(sql.includes('UPDATE parcel_boundary_claims')){reviews++;return {rows:[],rowCount:1}};
  throw Error('Unexpected SQL during parcel review '+sql);
 }})};
 const accessAdapter=load('apps/api/src/contexts/access/infrastructure/transactional-access.ts');
 const {PgParcelRepository}=load('apps/api/src/contexts/geospatial/infrastructure/pg-parcel.repository.ts',{
  '../../../contexts/access/infrastructure/transactional-access':accessAdapter,
  '../../../contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'../../../database':{},'../../../audit':{},'../../../common':{uid:()=> 'audit-id',isUuid:s=>s},'../domain/parcel-boundary':{canReviewBoundary:()=>true}
 });
 const svc=new PgParcelRepository(db,{write:async()=>{}});
 const actor={id:'reviewer-20',organizationId:'org-20',role:'SURVEYOR',professionalApproved:true};
 return {statements, get reviews(){return reviews},run:()=>svc.review(actor,'session-20','asset-20','claim-20','REJECTED','This boundary lacks documentation')};
}
test('RED→GREEN: actual repository rejects parcel approval with disabled MFA and stale step-up timestamp',async()=>{
 const f=parcelReviewFixture(false);
 await assert.rejects(()=>f.run(),/Fresh MFA verification required/);
 assert.equal(f.reviews,0,'No parcel update should occur with disabled MFA');
 assert.equal(f.statements.length,1,'Authorization must happen before touching the parcel');
});
test('actual repository can continue an independent review with enabled MFA and fresh step-up',async()=>{
 const f=parcelReviewFixture(true);
 const result=await f.run();
 assert.equal(result.status,'REJECTED');
 assert.equal(f.reviews,1);
 assert.ok(f.statements.some(sql=>sql.includes('FOR SHARE OF s,m')));
});
