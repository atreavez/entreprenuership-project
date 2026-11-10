/** Runs the *actual* AuthenticationService method from TypeScript with intentionally small
 * dependency boundaries. No NestJS install or database needed. In-memory SQL adapter only
 * simulates the MFA tables used in this test; it is NOT a PostgreSQL integration test. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../apps/api/src/auth.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false,esModuleInterop:true}}).outputText;
class UnauthorizedException extends Error{}
class ForbiddenException extends Error{}
class BadRequestException extends Error{}
const decorator=()=>()=>{};
const commonNest={Body:decorator,Controller:decorator,Delete:decorator,Get:decorator,Injectable:decorator,Module:decorator,Post:decorator,Req:decorator,Res:decorator,UseGuards:decorator,UnauthorizedException,ConflictException:class extends Error{},BadRequestException,ForbiddenException,ServiceUnavailableException:class extends Error{}};
const fakeModules={
 '@nestjs/common':commonNest,
 '@nestjs/jwt':{JwtModule:{register:()=>({})},JwtService:class{}},
 '@nestjs/throttler':{Throttle:decorator},
 'argon2':{verify:async()=>true,hash:async()=> 'hash'},
 './database':{Database:class{}},
 './audit':{AuditService:class{}},
 './common':{uid:crypto.randomUUID,hash:v=>crypto.createHash('sha256').update(v).digest('hex'), text:(v,key)=>{if(typeof v!=='string'||!v.trim())throw new BadRequestException(key);return v},UserAuth:class{}},
 './contexts/identity/application/session-usecases':{SessionUseCases:class{}},
 './contexts/identity/infrastructure/pg-session.repository':{PgSessionRepository:class{}},
 './contexts/identity/domain/identity-policy':{
  CHALLENGE_TTL_MS:300000,createMfaSecret:()=>'',decodeBase32:()=>Buffer.alloc(20),hashOpaque:v=>crypto.createHash('sha256').update(v).digest('hex'),
  openSecret:()=>'',sealSecret:()=>'',validateNewPassword:()=>{},verifyTotp:()=>null,isValidRecoveryCode:v=>typeof v==='string'&&/^[A-Za-z0-9_-]{14}$/.test(v)
 }
};
const sandbox={module:{exports:{}},exports:{},require:id=>fakeModules[id]||require(id),process:{env:{...process.env,MFA_ENCRYPTION_KEY:'aa'.repeat(32)}},Buffer,Date,console,setTimeout};
sandbox.exports=sandbox.module.exports;
vm.runInNewContext(js,sandbox,{filename:'auth.ts',timeout:3000});
const {AuthenticationService}=sandbox.module.exports;
function fixture(consumed,code='AbcdEFG123_456'){
 const record={hash:crypto.createHash('sha256').update(code).digest('hex'),consumed,exists:true};
 const state={mfaEnabled:true,otherSessionsRevoked:false,audits:0,deleted:false};
 const query=async(sql,values)=>{
  if(sql.includes('SELECT password_hash FROM users'))return {rows:[{password_hash:'hash'}]};
  if(sql.includes('SELECT secret_ciphertext,enabled,last_used_step'))return {rows:[{secret_ciphertext:'sealed',enabled:state.mfaEnabled,last_used_step:-1}]};
  if(sql.includes('DELETE FROM auth_recovery_codes')&&sql.includes('code_hash')){
   const unusedCondition=sql.includes('consumed_at IS NULL');
   if(record.exists&&record.hash===values[1]&&(!unusedCondition||!record.consumed)){
    record.exists=false;return {rowCount:1,rows:[{id:'recovery'}]};
   }
   return {rowCount:0,rows:[]};
  }
  if(sql.includes('DELETE FROM auth_mfa_credentials')){state.mfaEnabled=false;return {rowCount:1,rows:[]}};
  if(sql.includes('DELETE FROM auth_recovery_codes')){state.deleted=true;return {rowCount:1,rows:[]}};
  if(sql.includes('UPDATE auth_sessions')){state.otherSessionsRevoked=true;return {rowCount:1,rows:[]}};
  throw Error('Unexpected SQL in focused MFA test: '+sql);
 };
 const db={query,transaction:async handler=>{
   // Snapshot simulates transaction rollback on an MFA failure.
   const saved={...state}, old={...record};
   try{return await handler({query});}catch(e){Object.assign(state,saved);Object.assign(record,old);throw e;}
 }};
 const audit={write:async()=>{state.audits++}};
 const auth=new AuthenticationService(db,{},audit);
 const user={id:'user-a',organizationId:'org-a'};
 return {record,state,run:(candidate=code)=>auth.disableMfa(user,'session-a',{currentPassword:'secure-password',backupCode:candidate})};
}
test('RED/GREEN: a backup code consumed at login must not disable MFA later',async()=>{
 const f=fixture(true);
 await assert.rejects(()=>f.run(),/Invalid MFA code/);
 assert.equal(f.state.mfaEnabled,true);
 assert.equal(f.state.otherSessionsRevoked,false);
 assert.equal(f.state.audits,0);
});
test('an unused correctly formatted backup code can disable MFA and revoke other sessions',async()=>{
 const f=fixture(false);const reply=await f.run();
 assert.equal(reply.enabled,false);
 assert.equal(f.state.mfaEnabled,false);
 assert.equal(f.state.otherSessionsRevoked,true);
 assert.equal(f.state.audits,1);
});
test('arbitrary/malformed recovery code must not be accepted by MFA disable',async()=>{
 const f=fixture(false);await assert.rejects(()=>f.run('not an actual recovery code'),/Invalid MFA code/);
 assert.equal(f.state.mfaEnabled,true);
});
