'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'apps/api/src/contexts/anchoring/domain/anchor-job-policy.ts'),'utf8'),mod={exports:{}};
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports});
const {createJob,recoverJob,nextOperation,applyOutcome}=mod.exports;
const config={version:3,enabled:true,target:{providerId:'mock',networkId:'testnet',minConfirmations:6},retryBaseMs:1000,maxAttempts:1,pollMs:5000};
const fresh=()=>createJob('12345678-1234-4234-8234-123456789abc','22345678-1234-4234-8234-123456789abc','a'.repeat(64),config,1000);
test('recovery requeues a stopped job with known transaction for verification, not resubmission',()=>{
 let j=applyOutcome(fresh(),{state:'SUBMITTED',anchored:false,transactionId:'tx1'},1000);
 j=applyOutcome(j,{state:'RETRY_REQUIRED',anchored:false},6000);
 assert.equal(j.state,'MANUAL_REVIEW');
 const next=recoverJob(j,config,j.revision,7000);
 assert.equal(next.transactionId,'tx1');assert.equal(nextOperation(next,7000),'VERIFY');assert.equal(next.revision,j.revision+1);assert.equal(next.failures,0);
});
test('recovery rejects stale revision, changed provider policy, disabled policy and nonstopped jobs',()=>{
 const j=applyOutcome(fresh(),{state:'NOT_CONNECTED',anchored:false},1000);
 assert.throws(()=>recoverJob(j,config,0,2000));
 assert.throws(()=>recoverJob(j,{...config,version:4},j.revision,2000));
 assert.throws(()=>recoverJob(j,{...config,enabled:false},j.revision,2000));
 assert.throws(()=>recoverJob(fresh(),config,0,2000));
 assert.equal(nextOperation(recoverJob(j,config,j.revision,2000),2000),'SUBMIT');
});
test('recovery is authorized and history is appended atomically; no dispatch called',()=>{
 const s=fs.readFileSync(path.join(root,'apps/api/src/contexts/anchoring/infrastructure/anchoring.module.ts'),'utf8');
 const method=s.slice(s.indexOf(' async recover('),s.indexOf(' async list('));
 for(const text of ['await setTenantScope','await assertCurrentAdminStepUp','FOR SHARE','FOR UPDATE','revision=$3','lease_until<=','await appendHistory(tx,saved)','ANCHOR_JOB_REQUEUED',"dispatchState:'NOT_CONNECTED'"])assert(method.includes(text),text);
 assert(method.indexOf('await assertCurrentAdminStepUp')<method.indexOf('UPDATE public.anchor_jobs'));
 assert(!method.includes('AnchorService'));
});
