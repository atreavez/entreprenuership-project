'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const os=require('node:os');const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const src='apps/api/src/contexts/platform/domain/runtime-config.ts';
const temp=mkdtempSync(path.join(os.tmpdir(),'assettrust-v81-config-'));
const compilation=spawnSync('tsc',['--strict','--target','es2022','--module','commonjs','--outDir',temp,src],{cwd:ROOT,encoding:'utf8',timeout:15000});
if(compilation.status!==0)throw Error('Runtime policy did not independently compile: '+compilation.stdout+' '+compilation.stderr);
const policy=require(path.join(temp,'runtime-config.js'));
const MFA='399466047adf294b88475486d9daff7b4103c1a7397f2eeaccc88a70f0c2aa97';
const PEPPER='f4b8a203c7d95e61a0fe39db784106cf291c0bad63e572804bfc7d158e92c03a';
const DOC='92b9a909f9616552a18c9268d364cc5f23f093da5d4454687e6f8e2727a6051b';
function env(changes={}){return {
 NODE_ENV:'development',DATABASE_URL:'postgres://local:devpass@127.0.0.1:5432/assettrust_test',
 WEB_ORIGIN:'http://localhost:5173',
 JWT_SECRET:'daa392f255eaaab8a476e50644bcfeaceefb9cc4a22b62ebe1f1bb6231a3eeb2',
 MFA_ENCRYPTION_KEY:MFA,LOGIN_ABUSE_PEPPER:PEPPER,DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:DOC}),...changes};}
function codes(config){return policy.validateRuntimeConfig(config).issues.map(x=>x.code);}
const marker='assettrust-v81-disposable-67d10a49aa';
test('a correctly configured development API is accepted',()=>assert.deepEqual(codes(env()),[]));
test('a correctly configured test API with disposable marker is accepted',()=>{
 assert.deepEqual(codes(env({NODE_ENV:'test',API_BIND_HOST:'127.0.0.1',ASSETTRUST_E2E_TARGET_ID:marker,ASSETTRUST_E2E_EXPECT_TARGET:marker,ASSETTRUST_E2E_ALLOW_MUTATION:'YES'})),[]);
});
test('development missing login abuse pepper is a startup blocker (not deferred to login)',()=>assert.ok(codes(env({LOGIN_ABUSE_PEPPER:''})).includes('LOGIN_ABUSE_KEY_INVALID')));
test('test mode missing login abuse pepper is a startup blocker',()=>assert.ok(codes(env({NODE_ENV:'test',LOGIN_ABUSE_PEPPER:undefined})).includes('LOGIN_ABUSE_KEY_INVALID')));
test('weak login pepper cannot be accepted in development',()=>assert.ok(codes(env({LOGIN_ABUSE_PEPPER:'ab'.repeat(32)})).includes('LOGIN_ABUSE_KEY_INVALID')));
test('MFA and login-abuse keys cannot be reused outside production',()=>assert.ok(codes(env({LOGIN_ABUSE_PEPPER:MFA})).includes('LOGIN_ABUSE_KEY_REUSE')));
test('document and login-abuse keys cannot be reused in test mode',()=>assert.ok(codes(env({NODE_ENV:'test',LOGIN_ABUSE_PEPPER:DOC})).includes('LOGIN_ABUSE_KEY_REUSE')));
test('port defaults to 4000',()=>assert.equal(policy.apiListenPort(undefined),4000));
test('port accepts configured valid endpoints',()=>{assert.equal(policy.apiListenPort('4000'),4000);assert.equal(policy.apiListenPort('65535'),65535);});
for(const input of ['0','65536','-1','3.5','abc','1e3',' 4000','4000 ','01','80/invalid','9999999999999999']){
 test('rejects invalid PORT='+JSON.stringify(input),()=>{
  assert.throws(()=>policy.apiListenPort(input),/PORT_INVALID/);
  assert.ok(codes(env({PORT:input})).includes('PORT_INVALID'));
 });
}
test('CORS normalizes whitespace in validated origin list',()=>{
 const list=policy.allowedWebOrigins(' http://localhost:5173 , http://127.0.0.1:5174 ',false);
 assert.deepEqual(list,['http://localhost:5173','http://127.0.0.1:5174']);
 assert.deepEqual(codes(env({WEB_ORIGIN:' http://localhost:5173 , http://127.0.0.1:5174 '})),[]);
});
test('CORS rejects duplicate origins after normalization',()=>assert.ok(codes(env({WEB_ORIGIN:'http://localhost:5173, http://localhost:5173'})).includes('WEB_ORIGIN_INVALID')));
test('CORS rejects wildcard and credentials',()=>{
 for(const origin of ['*','http://user:password@localhost:5173','null','http://localhost:5173/path'])
  assert.ok(codes(env({WEB_ORIGIN:origin})).includes('WEB_ORIGIN_INVALID'));
});
test('CORS never silently falls back to an undeclared origin',()=>assert.throws(()=>policy.allowedWebOrigins(undefined,false),/WEB_ORIGIN_INVALID/));
test('dev with test marker must be rejected before HTTP server binds',()=>assert.ok(codes(env({ASSETTRUST_E2E_TARGET_ID:marker})).includes('TEST_MARKER_OUTSIDE_TEST')));
test('prod with marker remains forbidden',()=>assert.ok(codes(env({NODE_ENV:'production',ASSETTRUST_E2E_TARGET_ID:marker})).includes('TEST_MARKER_PRODUCTION')));
test('test markers must be safe, bounded strings',()=>{
 for(const value of ['short','malicious marker with space','a'.repeat(130)])
  assert.ok(codes(env({NODE_ENV:'test',ASSETTRUST_E2E_TARGET_ID:value})).includes('TEST_MARKER_INVALID'));
});
test('mismatched E2E expectation prevents startup',()=>assert.ok(codes(env({NODE_ENV:'test',ASSETTRUST_E2E_TARGET_ID:marker,ASSETTRUST_E2E_EXPECT_TARGET:marker+'x'})).includes('TEST_MARKER_MISMATCH')));
test('mutation opt-in requires both test mode and a marker',()=>{
 assert.ok(codes(env({ASSETTRUST_E2E_ALLOW_MUTATION:'YES'})).includes('TEST_MUTATION_UNSAFE'));
 assert.ok(codes(env({NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES'})).includes('TEST_MUTATION_UNSAFE'));
});
test('test server cannot explicitly select public bind host',()=>assert.ok(codes(env({NODE_ENV:'test',API_BIND_HOST:'0.0.0.0'})).includes('TEST_BIND_UNSAFE')));
test('E2E API selects loopback even if an external bind is configured',()=>assert.equal(policy.apiListenHost(env({NODE_ENV:'test',API_BIND_HOST:'0.0.0.0'})),'127.0.0.1'));
test('production binds loopback by default',()=>assert.equal(policy.apiListenHost(env({NODE_ENV:'production',API_BIND_HOST:undefined})),'127.0.0.1'));
test('development without an explicit reviewed LAN opt-in stays loopback-only',()=>assert.equal(policy.apiListenHost(env()),'127.0.0.1'));
test('the listener and runtime preflight use the same CORS, port and bind contract',()=>{
 const main=readFileSync(path.join(ROOT,'apps/api/src/main.ts'),'utf8');
 for(const name of ['allowedWebOrigins','apiListenPort','apiListenHost'])assert.match(main,new RegExp('\\b'+name+'\\(process\\.env'));
 assert.doesNotMatch(main,/WEB_ORIGIN\|\|'http:\/\/localhost:5173'/);
});
test('startup errors reveal issue codes, not secret values',()=>{
 const bad=env({JWT_SECRET:'SensitiveInvalidJwtA'.repeat(4),LOGIN_ABUSE_PEPPER:'SensitiveInvalidPepper'});
 const report=JSON.stringify(policy.validateRuntimeConfig(bad));
 assert.doesNotMatch(report,/SensitiveInvalidJwtA|SensitiveInvalidPepper/);
});
test.after(()=>rmSync(temp,{recursive:true,force:true}));
