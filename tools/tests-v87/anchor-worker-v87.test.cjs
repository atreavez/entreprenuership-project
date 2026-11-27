'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),base='apps/api/src/contexts/anchoring/';
function load(file,imports={}){
 const source=fs.readFileSync(path.join(root,base,file),'utf8'),mod={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}},{timeout:3000});
 return mod.exports;
}
const policy=load('domain/anchor-job-policy.ts');
const {AnchorService}=load('application/anchor-service.ts');
const {AnchorWorker}=load('application/anchor-worker.ts',{'../domain/anchor-job-policy':policy,'./anchor-service':{AnchorService}});
const org='12345678-1234-4234-8234-123456789abc',id='22345678-1234-4234-8234-123456789abc';
const config={version:1,enabled:true,target:{providerId:'mock',networkId:'testnet',minConfirmations:6},retryBaseMs:1000,maxAttempts:3,pollMs:5000};
function fixture(saved=true,job=policy.createJob(id,org,'a'.repeat(64),config,1000)){
 const changes=[],calls=[];
 const jobs={claim:async(...args)=>{calls.push(args);return {job,leaseToken:'lease-test'};},save:async(...args)=>{changes.push(args);return saved;}};
 return {jobs,changes,calls};
}
test('worker claims scoped job and submits only through the trusted gate',async()=>{
 const f=fixture();let submits=0;
 const service=new AnchorService({providerId:'mock',submit:async()=>{submits++;return {transactionId:'tx1'}},observe:async()=>null});
 const worker=new AnchorWorker(f.jobs,{resolve:async(job,op)=>{assert.equal(job.organizationId,org);assert.equal(op,'SUBMIT');return service;}},()=>1000);
 assert.equal(await worker.runOne(org),'SAVED');assert.equal(submits,1);
 assert.deepEqual(f.calls[0],[org,1000,61000]);assert.equal(f.changes[0][0],org);assert.equal(f.changes[0][1],0);assert.equal(f.changes[0][2],'lease-test');
 assert.equal(f.changes[0][3].transactionId,'tx1');assert.equal(f.changes[0][3].state,'SUBMITTED');
});
test('gate refusal blocks job and stale lease cannot be acknowledged',async()=>{
 const f=fixture(false);
 const worker=new AnchorWorker(f.jobs,{resolve:async()=>null},()=>1000);
 assert.equal(await worker.runOne(org),'LEASE_LOST');assert.equal(f.changes[0][3].state,'BLOCKED');
});
test('cross-tenant claim fails before gate or save',async()=>{
 const f=fixture(true,policy.createJob(id,'32345678-1234-4234-8234-123456789abc','a'.repeat(64),config,1000));
 const worker=new AnchorWorker(f.jobs,{resolve:async()=>{throw Error('must not invoke gate')}},()=>1000);
 await assert.rejects(worker.runOne(org),/tenant mismatch/);assert.equal(f.changes.length,0);
});
test('active SQL and repository include tenant scope, concurrency fence and transactional history',()=>{
 const sql=fs.readFileSync(path.join(root,'apps/api/sql/029_anchor_jobs.sql'),'utf8');
 const repo=fs.readFileSync(path.join(root,base,'infrastructure/pg-anchor-job.repository.ts'),'utf8');
 for(const table of ['anchor_jobs','anchor_job_history']){
  assert(sql.includes('ALTER TABLE public.'+table+' FORCE ROW LEVEL SECURITY'));
 }
 assert(sql.includes('UNIQUE (organization_id,provider_id,network_id,commitment)'));
 assert(!/CREATE POLICY[^;]*ON public\.anchor_job_history FOR (UPDATE|DELETE|ALL)/.test(sql));
 for(const term of ['FOR UPDATE SKIP LOCKED','lease_token=$4','revision=$3','lease_until>','clock_timestamp()','await appendHistory(tx','await setTenantScope(tx,organizationId)'])assert(repo.includes(term),term);
});
