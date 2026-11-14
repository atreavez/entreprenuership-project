'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..');
const env={PASSWORD_RESET_RELAY_URL:'https://mail.example.org/send',PASSWORD_RESET_RELAY_TOKEN:'Z'.repeat(48),PASSWORD_RESET_PUBLIC_ORIGIN:'https://app.example.org',WEB_ORIGIN:'https://app.example.org',PASSWORD_RESET_LOOKUP_PEPPER:'b3a75cde109f4628edca5b0f774d912e624bb38a5f6c0dfe13597ab8e4d2c091'};
const domainPath=path.join(root,'apps/api/src/contexts/identity/domain/password-reset-policy.ts');
const domainJs=ts.transpileModule(fs.readFileSync(domainPath,'utf8'),{fileName:domainPath,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const domain={exports:{}};vm.runInNewContext(domainJs,{exports:domain.exports,module:domain,require,Buffer,URL},{filename:domainPath});
const policy=domain.exports;
function setup({found=true,count=1,deliveryFails=false,recordState={},auditFails=false}={}){
 const calls=[],messages=[];let pending=null;
 const resetToken=policy.makePasswordResetToken();
 const record={id:'00000000-0000-4000-8000-000000000005',user_id:'00000000-0000-4000-8000-000000000007',organization_id:'00000000-0000-4000-8000-000000000008',full_name:'Test User',email:'member@example.org',role:'CLIENT',password_hash:'hash_oldpass12345',delivery_state:'SENT',expires_at:new Date(Date.now()+10*60_000),consumed_at:null,revoked_at:null,suspended_at:null,...recordState};
 const account={id:record.user_id,email:record.email};
 const query=async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes('SELECT 1 FROM auth_password_reset_requests'))return {rows:found&&record.delivery_state==='SENT'&&!record.revoked_at&&!record.consumed_at&&new Date(record.expires_at).getTime()>Date.now()?[{exists:1}]:[]};
  if(sql.includes('INSERT INTO auth_password_reset_windows'))return {rows:[{request_count:count}]};
  if(sql.includes('SELECT id,email FROM users WHERE email='))return {rows:found?[account]:[]};
  if(sql.includes('INSERT INTO auth_password_reset_requests')){pending={id:params[0],digest:params[2]};return {rows:[],rowCount:1}};
  if(sql.includes('SELECT u.id FROM auth_password_reset_requests'))return {rows:found?[{id:account.id}]:[]};
  if(sql.includes('FROM auth_password_reset_requests r JOIN users'))return {rows:found?[record]:[]};
  if(sql.includes('UPDATE auth_password_reset_requests SET consumed_at=now()'))record.consumed_at=new Date();
  return {rows:[],rowCount:1};
 };
 const db={query,transaction:async(fn)=>fn({query})};
 const audit={write:async(tx,actor,action,kind,id,detail)=>{calls.push({sql:'AUDIT_'+action,params:[actor,id,detail]});if(auditFails)throw Error('audit failed');}};
 const decorators={Injectable:()=>c=>c};
 const errors=['BadRequestException','ServiceUnavailableException','UnauthorizedException'];for(const name of errors)decorators[name]=class extends Error{};
 const identity={hashOpaque:val=>crypto.createHash('sha256').update(val).digest('hex'),validateNewPassword:pw=>{if(typeof pw!=='string'||pw.length<12||!/[0-9]/.test(pw)||!/[A-Za-z]/.test(pw))throw Error('Weak password')}};
 const argon={argon2id:2,hash:async pw=>'hash_'+pw,verify:async(hash,pw)=>hash==='hash_'+pw};
 const stubRequire=(name)=>({
  '@nestjs/common':decorators,'argon2':{__esModule:true,default:argon},'node:crypto':crypto,
  '../../../database':{},'../../../audit':{},
  '../domain/identity-policy':identity,
  '../domain/password-reset-policy':policy,
  './password-reset-delivery':{sendPasswordResetNotice:async(given,to,token)=>{messages.push({to,token});if(deliveryFails)throw Error('Relay down')}}
 })[name]??(()=>{throw Error('Unexpected import '+name)})();
 const filename=path.join(root,'apps/api/src/contexts/identity/infrastructure/password-reset.service.ts');
 const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText;
 const m={exports:{}};
 vm.runInNewContext(js,{exports:m.exports,module:m,require:stubRequire,process:{env},console:{warn:msg=>calls.push({sql:'WARN',params:[msg]})},Date,Number,Promise,Buffer,Error},{filename,timeout:3000});
 return {service:new m.exports.PasswordResetService(db,audit),calls,messages,record,get pending(){return pending},resetToken};
}
test('unknown account and rate-limit reply are generic, store only keyed email digest, and send nothing',async()=>{
 for(const option of [{found:false},{count:4}]){
  const x=setup(option),out=await x.service.request('Member@Example.ORG');
  assert.equal(out.ok,true);assert.match(out.message,/If this address/);
  assert.equal(x.messages.length,0);assert.equal(x.pending,null);
  const attempt=x.calls.find(c=>c.sql.includes('INSERT INTO auth_password_reset_windows'));
  assert.match(attempt.params[0],/^[a-f0-9]{64}$/);
  assert.notEqual(attempt.params[0],'member@example.org');
 }
});
test('existing account issues hash-only reset record and emails token separately via server adapter',async()=>{
 const x=setup(),response=await x.service.request('member@example.org');
 assert.equal(response.ok,true);assert(!JSON.stringify(response).includes('token'));
 assert.equal(x.messages.length,1);assert.equal(x.messages[0].to,'member@example.org');
 assert.equal(x.pending.digest,crypto.createHash('sha256').update(x.messages[0].token).digest('hex'));
 assert.notEqual(x.pending.digest,x.messages[0].token);
 assert(x.calls.some(c=>c.sql.includes("delivery_state='SENT'")));
});
test('failed relay invalidates reset token without exposing account or token in response/log',async()=>{
 const x=setup({deliveryFails:true}),reply=await x.service.request('member@example.org');
 assert.equal(reply.ok,true);assert(x.calls.some(c=>c.sql.includes("delivery_state='FAILED',revoked_at=now()")));
 const warnings=x.calls.filter(c=>c.sql==='WARN');assert.equal(warnings.length,1);
 assert(!JSON.stringify(warnings).includes(x.messages[0].token));
});
test('reset token is one-use and invalid after expiry, withdrawal, suspension or failed delivery',async()=>{
 for(const edit of [{expires_at:new Date(Date.now()-1000)},{revoked_at:new Date()},{consumed_at:new Date()},{suspended_at:new Date()},{delivery_state:'FAILED'}]){
  const x=setup({recordState:edit});await assert.rejects(()=>x.service.confirm(x.resetToken,'newpassword12345'),/Invalid or expired/);
  assert(!x.calls.some(c=>c.sql.startsWith('UPDATE users SET password_hash')));
 }
 const valid=setup();const reply=await valid.service.confirm(valid.resetToken,'newpassword12345');
 assert.equal(reply.ok,true);assert(valid.record.consumed_at);
 await assert.rejects(()=>valid.service.confirm(valid.resetToken,'newpassword12345'),/Invalid or expired/);
});
test('valid reset revokes every session and MFA challenge; preserves MFA enrollment; writes audit',async()=>{
 const x=setup();await x.service.confirm(x.resetToken,'newpassword12345');
 const statements=x.calls.map(c=>c.sql).join('\n');
 assert.match(statements,/UPDATE users SET password_hash/);
 assert.match(statements,/UPDATE auth_sessions SET revoked_at/);
 assert.match(statements,/UPDATE auth_login_challenges SET consumed_at/);
 assert.match(statements,/AUDIT_PASSWORD_RESET_COMPLETED/);
 assert.doesNotMatch(statements,/DELETE FROM auth_mfa_credentials/);
 assert(x.calls.find(c=>c.sql.includes('FROM auth_password_reset_requests r JOIN users')).params[0].match(/^[a-f0-9]{64}$/));
});
test('password reuse, weak password, malformed token and failed audit fail closed',async()=>{
 for(const [token,pw] of [['not-a-token','newpassword12345'],[policy.makePasswordResetToken(),'short'],[policy.makePasswordResetToken(),'oldpass12345']]){
  const x=setup();await assert.rejects(()=>x.service.confirm(token,pw));
 }
 const bad=setup({auditFails:true});await assert.rejects(()=>bad.service.confirm(bad.resetToken,'newpassword12345'),/audit failed/);
});
