'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base='apps/api/src/contexts/billing/';
function load(file,imports={}){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(read(base+file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});
 return m.exports;
}
const d=load('domain/reconciliation-job.ts'),{ReconciliationWorker}=load('application/reconciliation-worker.ts',{'../domain/reconciliation-job':d});
const org='12345678-1234-4234-8234-123456789abc',invoiceId='22345678-1234-4234-8234-123456789abc',id='32345678-1234-4234-8234-123456789abc';
const request={organizationId:org,invoiceId,providerId:'offline',transactionId:'tx1'},policy={version:1,enabled:true,providers:['offline'],retryBaseMs:1000,pollMs:5000,maxAttempts:3};
const initial=()=>d.createReconciliationJob(id,request,policy,1000);
test('approved configuration is strict, immutable and excludes credentials',()=>{
 const {version,...input}=policy;const text=d.canonicalPaymentPolicyText(JSON.stringify(input));const active=d.parsePaymentPolicyText(text,2);
 assert.equal(active.version,2);assert(Object.isFrozen(active.providers));
 for(const bad of [{...input,endpoint:'https://example.invalid'},{...input,providers:[]},{...input,maxAttempts:21},{...input,version:1},{...input,providers:['x','x']}])assert.throws(()=>d.canonicalPaymentPolicyText(JSON.stringify(bad)));
 assert(!d.currentPolicyMatches(initial(),active));assert(!d.currentPolicyMatches(initial(),{...policy,enabled:false}));
});
test('pending and retry consume finite attempt budget with bounded timing',()=>{
 const first=d.applyReconciliationOutcome(initial(),'PENDING',1000);assert.equal(first.nextRunAt,6000);assert.equal(first.attempts,1);
 const second=d.applyReconciliationOutcome(first,'RETRY_REQUIRED',6000);assert.equal(second.nextRunAt,8000);
 const third=d.applyReconciliationOutcome(second,'PENDING',8000);assert.equal(third.state,'REVIEW_REQUIRED');assert.equal(third.nextRunAt,null);assert.equal(third.attempts,3);
 assert.throws(()=>d.applyReconciliationOutcome(third,'SETTLED',9000));
});
test('recovery retains original provider, transaction, version and requires exact revision',()=>{
 const stopped=d.applyReconciliationOutcome(initial(),'NOT_CONNECTED',1000);
 assert.throws(()=>d.recoverReconciliationJob(stopped,{...policy,version:2},1,2000));
 assert.throws(()=>d.recoverReconciliationJob(stopped,policy,0,2000));
 const next=d.recoverReconciliationJob(stopped,policy,1,2000);
 assert.equal(next.state,'QUEUED');assert.equal(next.request,stopped.request);assert.equal(next.revision,2);
 assert.throws(()=>d.recoverReconciliationJob(d.applyReconciliationOutcome(initial(),'SETTLED',1000),policy,1,2000));
});
test('worker disabled by deployment, fences acknowledgment and handles interrupted settlement retry',async()=>{
 let calls=0,ack=null;
 const claim={job:initial(),leaseToken:'lease'},jobs={claim:async()=>{calls++;return claim;},save:async(c,n)=>{assert.equal(c,claim);ack=n;return false;}};
 const disabled=new ReconciliationWorker(jobs,{resolve:async()=>{throw Error('must not resolve');}},()=>false,90000,()=>1000);
 assert.equal(await disabled.runOne(org),'IDLE');assert.equal(calls,0);
 const worker=new ReconciliationWorker(jobs,{resolve:async c=>{assert.equal(c,claim);return {reconcile:async()=> 'ALREADY_SETTLED'};}},()=>true,90000,()=>1000);
 assert.equal(await worker.runOne(org),'LEASE_LOST');assert.equal(ack.state,'SETTLED');
 const failed=new ReconciliationWorker(jobs,{resolve:async()=>{throw Error('network');}},()=>true,90000,()=>1000);
 assert.equal(await failed.runOne(org),'LEASE_LOST');assert.equal(ack.state,'RETRY_REQUIRED');
});
test('reviewed queue uses composite tenant relationships, fenced lease and append-only history',()=>{
 const sql=read('apps/api/sql/031_reconciliation_jobs.sql'),repo=read(base+'infrastructure/pg-reconciliation-jobs.ts'),settlement=read(base+'infrastructure/pg-settlement.repository.ts');
 assert(sql.includes('FOREIGN KEY(organization_id,invoice_id)'));assert(sql.includes('UNIQUE(organization_id,invoice_id,provider_id,transaction_id)'));assert(!/FOR DELETE TO PUBLIC/.test(sql));
 assert.equal((sql.match(/FOR UPDATE TO PUBLIC/g)||[]).length,1);assert(repo.includes('FOR UPDATE SKIP LOCKED'));assert(repo.includes('lease_token=$4 AND lease_until>'));
 assert(repo.includes('Settlement acknowledgement lacks persisted payment'));assert(repo.includes('pg_advisory_xact_lock_shared(hashtext($1))'));
 assert(settlement.includes('private readonly fence:'));assert.equal((settlement.match(/await this.fence\(tx,r\)/g)||[]).length,2);
 assert(read('apps/api/src/contexts/platform/domain/schema-manifest.ts').includes('031_reconciliation_jobs.sql'));
});
