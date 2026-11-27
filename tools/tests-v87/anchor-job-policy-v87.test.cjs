'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../apps/api/src/contexts/anchoring/domain/anchor-job-policy.ts'),'utf8');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Object,Number,RegExp,Array,Math,Error},{timeout:3000});
const {validateSettings,approveSettings,createJob,nextOperation,applyOutcome}=mod.exports;
const org='12345678-1234-4234-8234-123456789abc',jobId='22345678-1234-4234-8234-123456789abc';
const proposer='32345678-1234-4234-8234-123456789abc',reviewer='42345678-1234-4234-8234-123456789abc';
const config={version:1,enabled:true,target:{providerId:'mock',networkId:'testnet',minConfirmations:6},retryBaseMs:1000,maxAttempts:3,pollMs:5000};
const fresh=()=>createJob(jobId,org,'a'.repeat(64),config,1000);
test('settings reject raw secrets, arbitrary endpoints and unbounded retry policy',()=>{
 for(const bad of [{...config,privateKey:'secret'},{...config,target:{...config.target,url:'https://example.invalid'}},{...config,target:{...config.target,minConfirmations:0}},{...config,maxAttempts:0},{...config,retryBaseMs:0}]){
  assert.throws(()=>validateSettings(bad),/Invalid anchor settings/);
 }
});
test('only independent approval of the next current version may change settings',()=>{
 const proposal={proposerId:proposer,expectedVersion:1,settings:{...config,version:2},reason:'Reviewed testnet configuration'};
 assert.equal(approveSettings(config,proposal,reviewer).version,2);
 assert.throws(()=>approveSettings(config,proposal,proposer),/Independent/);
 assert.throws(()=>approveSettings({...config,version:2},proposal,reviewer),/Stale/);
});
test('disabled jobs do not run and approved configuration is an immutable snapshot',()=>{
 const job=createJob(jobId,org,'a'.repeat(64),{...config,enabled:false},1000);
 assert.equal(job.state,'BLOCKED');assert.equal(nextOperation(job,1000),null);
 assert(Object.isFrozen(job.settings.target));assert.throws(()=>applyOutcome(job,{state:'NOT_CONNECTED',anchored:false},1000));
});
test('submission persists transaction identity; retries never submit again after a transaction is known',()=>{
 const a=applyOutcome(fresh(),{state:'SUBMITTED',anchored:false,transactionId:'tx1'},1000);
 assert.equal(a.revision,1);assert.equal(nextOperation(a,5999),null);assert.equal(nextOperation(a,6000),'VERIFY');
 const b=applyOutcome(a,{state:'RETRY_REQUIRED',anchored:false},6000);
 assert.equal(b.transactionId,'tx1');assert.equal(nextOperation(b,7000),'VERIFY');
 assert.throws(()=>applyOutcome(b,{state:'SUBMITTED',anchored:false,transactionId:'tx2'},7000),/identity/);
});
test('retry scheduling backs off and stops at the configured limit',()=>{
 let a=fresh();
 for(const now of [1000,2000,4000])a=applyOutcome(a,{state:'RETRY_REQUIRED',anchored:false},now);
 assert.equal(a.failures,3);assert.equal(a.state,'MANUAL_REVIEW');assert.equal(a.nextRunAt,null);
 assert.equal(nextOperation(a,999999),null);
});
test('confirmation requires verified threshold and is rechecked for reorganizations',()=>{
 const a=applyOutcome(fresh(),{state:'SUBMITTED',anchored:false,transactionId:'tx1'},1000);
 assert.throws(()=>applyOutcome(a,{state:'CONFIRMED',anchored:true,transactionId:'tx1',confirmations:5},6000),/Insufficient/);
 const b=applyOutcome(a,{state:'CONFIRMED',anchored:true,transactionId:'tx1',confirmations:6},6000);
 assert.equal(b.confirmations,6);assert.equal(nextOperation(b,11000),'VERIFY');
 const c=applyOutcome(b,{state:'REORG_OR_INVALID',anchored:false,transactionId:'tx1'},11000);
 assert.equal(c.state,'REORG_OR_INVALID');assert.equal(c.confirmations,null);
 assert.equal(nextOperation(c,16000),'VERIFY');
});
test('disconnection blocks further processing without fabricating an anchor',()=>{
 const a=applyOutcome(fresh(),{state:'NOT_CONNECTED',anchored:false},1000);
 assert.equal(a.state,'BLOCKED');assert.equal(a.nextRunAt,null);assert.equal(a.transactionId,null);
});
