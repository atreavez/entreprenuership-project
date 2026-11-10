'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {resolve}=require('node:path');
const root=resolve(__dirname,'../..');
const keys=()=>({
 JWT_SECRET:randomBytes(32).toString('hex'),
 MFA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
 document:randomBytes(32).toString('hex')
});
const run=(changes={})=>{
 const k=keys();
 const env={...process.env,
 NODE_ENV:'test',CI:'true',DATABASE_URL:'postgres://assettrust:test_password@127.0.0.1:5432/assettrust_ci',
 WEB_ORIGIN:'http://localhost:5173',DOCUMENT_ACTIVE_KEY_ID:'ci_v13',
 DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({ci_v13:k.document}),
 JWT_SECRET:k.JWT_SECRET,MFA_ENCRYPTION_KEY:k.MFA_ENCRYPTION_KEY,
 ASSETTRUST_E2E_TARGET_ID:'test-only-disposable-v13-server',
 ASSETTRUST_E2E_EXPECT_TARGET:'test-only-disposable-v13-server',...changes};
 return spawnSync(process.execPath,['tools/ci-security-preflight.cjs'],{cwd:root,env,encoding:'utf8'});
};
test('real application startup policy accepts generated independent secrets',()=>{
 const res=run();assert.equal(res.status,0,res.stderr);assert.match(res.stdout,/PASS:/);assert.doesNotMatch(res.stdout,/KEY=|SECRET=/);
});
test('actual startup policy rejects an old placeholder JWT',()=>{
 const res=run({JWT_SECRET:'assettrust-ci-isolation-local-only-replace-in-deployment-2026'});
 assert.notEqual(res.status,0);assert.match(res.stderr,/JWT_WEAK/);
});
test('actual startup policy rejects invalid 70-character document key',()=>{
 const res=run({DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({ci_v13:'c'.repeat(70)})});
 assert.notEqual(res.status,0);assert.match(res.stderr,/DOCUMENT_KEY_WEAK/);
});
test('actual startup policy rejects reused encryption keys',()=>{
 const key='0a1b2c3d4e5f6789'.repeat(4);
 const res=run({MFA_ENCRYPTION_KEY:key,DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({ci_v13:key})});
 assert.notEqual(res.status,0);assert.match(res.stderr,/SECRET_REUSE/);
});
test('actual startup policy rejects mismatched disposable CI marker',()=>{
 const res=run({ASSETTRUST_E2E_EXPECT_TARGET:'another-test-marker-value'});
 assert.notEqual(res.status,0);assert.match(res.stderr,/instance identity/);
});
