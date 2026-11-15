'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const loaded=import('../e2e-mfa-onboarding-v82.mjs');
const SECRET='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('RFC 6238 SHA1 TOTP sample is reproduced in the six-digit domain',async()=>{
 const {syntheticTotp}=await loaded;
 assert.equal(syntheticTotp(SECRET,59_000),'287082');
 assert.equal(syntheticTotp(SECRET,1_111_111_109_000),'081804');
});
test('synthetic TOTP refuses malformed base32 and invalid clocks',async()=>{
 const {syntheticTotp}=await loaded;
 for(const value of ['ABC','foo!','a'.repeat(30),'0123456789','A'.repeat(16)+'=',''])assert.throws(()=>syntheticTotp(value,59_000),/INVALID_SYNTHETIC_MFA_SECRET/);
 for(const time of [-1,1.3,Infinity,NaN])assert.throws(()=>syntheticTotp(SECRET,time),/INVALID_SYNTHETIC_CLOCK/);
});
test('synthetic administrator enrollment submits a password and TOTP and stores no secrets',async()=>{
 const {enrollSyntheticAdminMfa}=await loaded,requests=[];
 const send=async(route,token,body)=>{requests.push({route,token,body});return route==='/auth/mfa/enroll'?{secret:SECRET}:{enabled:true,recoveryCodes:Array(10).fill('test-only')}};
 assert.equal(await enrollSyntheticAdminMfa({token:'Bearer-token',password:'private-test-password',send,clock:()=>59_000}),true);
 assert.deepEqual(requests.map(r=>r.route),['/auth/mfa/enroll','/auth/mfa/confirm']);
 assert.equal(requests[0].token,'Bearer-token');assert.equal(requests[0].body.currentPassword,'private-test-password');
 assert.equal(requests[1].token,'Bearer-token');assert.equal(requests[1].body.code,'287082');
 assert(!Object.keys(requests[1].body).includes('secret'));
});
test('synthetic enrollment fails closed if confirmation is missing or invalid',async()=>{
 const {enrollSyntheticAdminMfa}=await loaded;
 for(const response of [{enabled:true,recoveryCodes:[]},{enabled:false,recoveryCodes:Array(10).fill('test')},{enabled:true},null]){
  const send=async route=>route==='/auth/mfa/enroll'?{secret:SECRET}:response;
  await assert.rejects(()=>enrollSyntheticAdminMfa({token:'a',password:'b',send,clock:()=>59_000}),/SYNTHETIC_ADMIN_MFA_NOT_CONFIRMED/);
 }
});
test('synthetic enrollment rejects empty credentials without a network request',async()=>{
 const {enrollSyntheticAdminMfa}=await loaded;let called=0;
 await assert.rejects(()=>enrollSyntheticAdminMfa({token:'',password:'test',send:async()=>{called++;}}),/INVALID_SYNTHETIC_MFA_INPUT/);
 assert.equal(called,0);
});
for(const file of ['e2e-smoke.mjs','e2e-geo-v08.mjs','e2e-overlap-v10.mjs','e2e-authenticated-control-v69.mjs','e2e-document-revocation-v73.mjs']){
 test(`${file} enrolls synthetic admin before protected actions`,()=>{
  const source=fs.readFileSync(path.join(ROOT,'tools',file),'utf8');
  assert.match(source,/enrollSyntheticAdminMfa/);
  assert.match(source,/\.\/e2e-mfa-onboarding-v82\.mjs/);
  const call=source.indexOf('await enrollSyntheticAdminMfa(');
  assert(call>source.indexOf("'/auth/register'"),'MFA enrollment must follow registration');
  const protectedMarker=file==='e2e-authenticated-control-v69.mjs'?"'/admin-control/me'":file==='e2e-document-revocation-v73.mjs'?"'/assets'":file==='e2e-overlap-v10.mjs'?'const makeAsset=':"'/assets'";
  assert(source.indexOf(protectedMarker,call)>call,'MFA must occur before protected endpoint');
 });
}
test('synthetic E2E helper never prints, writes or logs credentials',()=>{
 const source=fs.readFileSync(path.join(ROOT,'tools/e2e-mfa-onboarding-v82.mjs'),'utf8');
 assert.doesNotMatch(source,/console\.|writeFile|appendFile|process\.stdout|fetch\(/);
});
