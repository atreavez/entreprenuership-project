'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const ts=require('../test-typescript-loader.cjs');
const authSource=fs.readFileSync(path.join(__dirname,'../../apps/api/src/auth.ts'),'utf8');
const js=ts.transpileModule(authSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true}}).outputText;
class UnauthorizedException extends Error {}
class BadRequestException extends Error {}
function loadAuth({rows,validPassword=false}) {
 const verifications=[];
 const decorator=()=>()=>{};
 const stubNest={Controller:decorator,Body:decorator,Delete:decorator,Get:decorator,Injectable:decorator,Module:decorator,Post:decorator,Req:decorator,Res:decorator,UseGuards:decorator,UnauthorizedException,BadRequestException,ForbiddenException:class extends Error{},ConflictException:class extends Error{},ServiceUnavailableException:class extends Error{}};
 const deps={
  '@nestjs/common':stubNest,'@nestjs/jwt':{JwtModule:{register:()=>({})}},'@nestjs/throttler':{Throttle:decorator},
  'argon2':{verify:async (hash,pw)=>{verifications.push({hash,pw});return validPassword;},hash:async()=>{throw Error('Unexpected hashing')}},
  './database':{}, './audit-service':{},
  './common':{uid:()=>'',text:(value)=>{if(typeof value!=='string')throw Error('invalid field');return value;},hash:()=>'',UserAuth:class{}},
  './contexts/identity/application/session-usecases':{}, './contexts/identity/infrastructure/pg-session.repository':{},
  './contexts/identity/domain/identity-policy':{},
 };
 const box={module:{exports:{}},exports:{},require:id=>deps[id]||require(id),Buffer,Date,console,process:{env:{}},setTimeout};box.exports=box.module.exports;
 vm.runInNewContext(js,box,{timeout:3000,filename:'auth.ts'});
 const auth=new box.module.exports.AuthenticationService({query:async()=>({rows})},{},{write:async()=>{}});
 return {auth,verifications};
}
test('RED/GREEN: nonexistent and incorrect-password accounts both perform one expensive verification',async()=>{
 const unknown=loadAuth({rows:[]});
 const existing=loadAuth({rows:[{id:'u',password_hash:'$argon2id$dummy',mfa_enabled:false}]});
 await assert.rejects(()=>unknown.auth.login({email:'missing@example.org',password:'12characters'}),/Incorrect credentials/);
 await assert.rejects(()=>existing.auth.login({email:'present@example.org',password:'12characters'}),/Incorrect credentials/);
 assert.equal(unknown.verifications.length,1,'Unknown account must not bypass password verification');
 assert.equal(existing.verifications.length,1,'Existing account must verify once');
 assert.equal(unknown.verifications[0].pw,'12characters');
 assert.equal(existing.verifications[0].pw,'12characters');
 assert.match(unknown.verifications[0].hash,/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
});
test('correct password on existing account follows existing session-creation path',async()=>{
 const existing=loadAuth({rows:[{id:'u',password_hash:'$argon2id$dummy',mfa_enabled:false}],validPassword:true});
 existing.auth.publicSession=async()=>({accessToken:'test-token'});
 const result=await existing.auth.login({email:'present@example.org',password:'12characters'});
 assert.equal(result.accessToken,'test-token');
 assert.equal(existing.verifications.length,1);
});
test('dummy hash must be independent of client input or user emails',()=>{
 assert.match(authSource,/LOGIN_DUMMY_PASSWORD_HASH/);
 assert.doesNotMatch(authSource,/console\.log\([^)]*(password|pw)/);
});
