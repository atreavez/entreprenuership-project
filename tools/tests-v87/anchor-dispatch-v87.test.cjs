'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src/contexts/anchoring');
function load(file,imports={}){
 const src=fs.readFileSync(path.join(root,file),'utf8'),m={exports:{}};
 vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:m,exports:m.exports,AbortController,setTimeout,clearTimeout,require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected import '+id);}});
 return m.exports;
}
const policy=load('domain/anchor-job-policy.ts'),service=load('application/anchor-service.ts');
const {AnchorWorker}=load('application/anchor-worker.ts',{'./anchor-service':service,'../domain/anchor-job-policy':policy});
const {AnchorAdapterRegistry,ApprovedAnchorDispatchGate}=load('application/anchor-dispatch.ts',{'./anchor-service':service,'../domain/anchor-job-policy':policy});
const {AnchorOrchestrator}=load('application/anchor-orchestrator.ts');
const tenant='12345678-1234-4234-8234-123456789abc',tenant2='22345678-1234-4234-8234-123456789abc';
const cfg={version:1,enabled:true,target:{providerId:'mock',networkId:'testnet',minConfirmations:6},retryBaseMs:1000,maxAttempts:3,pollMs:5000};
const job=policy.createJob(tenant2,tenant,'a'.repeat(64),cfg,1000);
const port={providerId:'mock',submit:async()=>({transactionId:'tx1'}),observe:async()=>null};
test('registry rejects duplicate providers and unknown networks',()=>{
 const entry={port,networkIds:['testnet']};
 assert.throws(()=>new AnchorAdapterRegistry([entry,entry]));
 assert.throws(()=>new AnchorAdapterRegistry([{port,networkIds:['testnet','testnet']}]));
 const registry=new AnchorAdapterRegistry([entry]);
 assert.equal(registry.lookup('mock','mainnet'),null);assert.equal(registry.lookup('mock','testnet'),port);
});
test('gate denies disabled dispatch, stale settings, missing adapter and emergency stop',async()=>{
 let authorized=false,current=cfg,calls=0;
 const registry=new AnchorAdapterRegistry([{port:{...port,submit:async()=>{calls++;return {transactionId:'tx1'};}},networkIds:['testnet']}]);
 const gate=new ApprovedAnchorDispatchGate(registry,{authorized:()=>authorized,current:async()=>current});
 assert.equal(await gate.resolve(job,'SUBMIT'),null);
 authorized=true;current={...cfg,version:2};assert.equal(await gate.resolve(job,'SUBMIT'),null);
 current=cfg;const svc=await gate.resolve(job,'SUBMIT');assert(svc);
 authorized=false;assert.equal((await svc.submit(cfg.target,job.commitment)).state,'RETRY_REQUIRED');assert.equal(calls,0);
 assert.equal(await new ApprovedAnchorDispatchGate(new AnchorAdapterRegistry(),{authorized:()=>true,current:async()=>cfg}).resolve(job,'SUBMIT'),null);
});
test('hung provider is cancelled, persisted as retry and late result cannot overwrite',async()=>{
 let signal,finish,saved=[];
 const adapter={...port,submit:async(_request,s)=>{signal=s;return new Promise(resolve=>{finish=resolve;});}};
 const svc=new service.AnchorService(adapter);
 const worker=new AnchorWorker({claim:async()=>({job,leaseToken:'lease'}),save:async(...args)=>{saved.push(args);return true;}},{resolve:async()=>svc},()=>1000,3000,15);
 assert.equal(await worker.runOne(tenant),'SAVED');
 assert.equal(signal.aborted,true);assert.equal(saved[0][3].state,'RETRY_REQUIRED');assert.equal(saved[0][3].transactionId,null);
 finish({transactionId:'late-tx'});await new Promise(r=>setTimeout(r,5));assert.equal(saved.length,1);
});
test('scheduler does not claim when disabled, skips overlap and rotates tenant cursor',async()=>{
 let enabled=false,release,calls=[],batches=[];
 const worker={runOne:async id=>{calls.push(id);if(id===tenant)await new Promise(r=>{release=r;});return 'SAVED';}};
 const source={nextBatch:async(after,limit)=>{batches.push([after,limit]);return after?[tenant2]:[tenant];}};
 const scheduler=new AnchorOrchestrator(worker,source,()=>enabled,1,()=>1000);
 assert.equal(await scheduler.tick(),'SKIPPED');assert.equal(calls.length,0);
 enabled=true;const first=scheduler.tick();await Promise.resolve();assert.equal(await scheduler.tick(),'SKIPPED');
 release();assert.equal(await first,'COMPLETED');assert.equal(await scheduler.tick(),'COMPLETED');
 assert.deepEqual(calls,[tenant,tenant2]);assert.deepEqual(batches,[[null,1],[tenant,1]]);assert.equal(scheduler.status().processed,2);
});
test('scheduler rejects malformed scope lists and reports sanitized failures',async()=>{
 const scheduler=new AnchorOrchestrator({runOne:async()=>{throw Error('must not run');}},{nextBatch:async()=>['bad']},()=>true);
 assert.equal(await scheduler.tick(),'FAILED');assert.equal(scheduler.status().lastError,'CYCLE_FAILED');assert.equal(scheduler.status().running,false);
});
