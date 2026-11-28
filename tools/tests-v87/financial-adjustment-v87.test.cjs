'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),base='apps/api/src/contexts/billing/';
function load(file,imports={}){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,base,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,AbortController,setTimeout,clearTimeout,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});
 return m.exports;
}
const d=load('domain/financial-adjustment.ts'),{AdjustmentService}=load('application/adjustment.service.ts',{'../domain/financial-adjustment':d});
const org='12345678-1234-4234-8234-123456789abc',invoice='22345678-1234-4234-8234-123456789abc',approvalId='32345678-1234-4234-8234-123456789abc',author='42345678-1234-4234-8234-123456789abc',reviewer='52345678-1234-4234-8234-123456789abc';
const funding={organizationId:org,invoiceId:invoice,providerId:'offline',transactionId:'tx1',currency:'UGX',amountUgx:25000};
const observation={...funding,kind:'REFUND',adjustmentId:'refund1',state:'CONFIRMED',amountUgx:10000};
const approval={...observation,id:approvalId,submittedBy:author,approvedBy:reviewer,reason:'Verified refund review'};
test('partial refund produces a balanced suspense posting without rewriting funding',()=>{
 const result=d.decideAdjustment(funding,observation,[],approval);
 assert.equal(result.state,'RECORDED');assert.equal(result.remainingUgx,15000);assert.equal(result.entitlement,'REVIEW_REQUIRED');
 assert.equal(result.record.debitAccount,'FINANCIAL_ADJUSTMENT_SUSPENSE');assert.equal(result.record.creditAccount,'PAYMENT_CLEARING');assert.equal(result.record.amountUgx,10000);assert(Object.isFrozen(result.record));assert.equal(funding.amountUgx,25000);
});
test('requires exact independently approved refund and confirmed matching observation',()=>{
 for(const a of [null,{...approval,approvedBy:author},{...approval,amountUgx:9999},{...approval,adjustmentId:'other'},{...approval,reason:'short'}])assert.throws(()=>d.decideAdjustment(funding,observation,[],a));
 for(const o of [{...observation,state:'PENDING'},{...observation,currency:'USD'},{...observation,organizationId:reviewer},{...observation,transactionId:'other'},{...observation,amountUgx:0}])assert.throws(()=>d.decideAdjustment(funding,o,[],approval));
});
test('duplicate replay is read-only; conflicting replay, consumed approval and excessive reversal fail',()=>{
 const prior=d.decideAdjustment(funding,observation,[],approval).record;
 assert.equal(d.decideAdjustment(funding,observation,[prior],null).state,'ALREADY_RECORDED');
 assert.throws(()=>d.decideAdjustment(funding,{...observation,amountUgx:1},[prior],null));
 assert.throws(()=>d.decideAdjustment(funding,{...observation,adjustmentId:'refund2'},[prior],{...approval,adjustmentId:'refund2'}));
 assert.throws(()=>d.decideAdjustment(funding,{...observation,kind:'CHARGEBACK',adjustmentId:'cb',amountUgx:15001},[prior],null));
});
test('external chargeback is independent of voluntary approval and can exhaust funding',()=>{
 const prior=d.decideAdjustment(funding,observation,[],approval).record;
 const cb={...observation,kind:'CHARGEBACK',adjustmentId:'cb',amountUgx:15000};
 const result=d.decideAdjustment(funding,cb,[prior],null);
 assert.equal(result.remainingUgx,0);assert.equal(result.entitlement,'REVERSED');assert.equal(result.record.approvalId,null);
 assert.throws(()=>d.decideAdjustment(funding,cb,[prior],approval));
 assert.equal(d.adjustedEntitlement('GRACE',1),'DENIED');assert.equal(d.adjustedEntitlement('ACTIVE',0),'ACTIVE');
});
test('provider dispatch defaults disabled and only exact confirmed observations reach persistence',async()=>{
 let calls=0;const repo={record:async()=>{calls++;return 'RECORDED';}},adapter={providerId:'offline',observeAdjustment:async()=>observation};
 assert.equal(await new AdjustmentService([adapter],repo).verify(observation),'NOT_CONNECTED');
 for(const [o,expected] of [[null,'PENDING'],[{...observation,state:'PENDING'},'PENDING'],[{...observation,adjustmentId:'other'},'REVIEW_REQUIRED'],[{...observation,state:'FAILED'},'REVIEW_REQUIRED']]){
  assert.equal(await new AdjustmentService([{...adapter,observeAdjustment:async()=>o}],repo,()=>true).verify(observation),expected);
 }
 assert.equal(calls,0);assert.equal(await new AdjustmentService([adapter],repo,()=>true).verify(observation),'RECORDED');assert.equal(calls,1);
});
test('timeout or revoked dispatch cannot record late reversal',async()=>{
 let calls=0,allowed=true,aborted=false;const repo={record:async()=>{calls++;return 'RECORDED';}};
 const slow={providerId:'offline',observeAdjustment:async(_r,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve(observation)},{once:true}))};
 assert.equal(await new AdjustmentService([slow],repo,()=>true,5).verify(observation),'RETRY_REQUIRED');assert(aborted);
 const revoked={providerId:'offline',observeAdjustment:async()=>{allowed=false;return observation;}};
 assert.equal(await new AdjustmentService([revoked],repo,()=>allowed).verify(observation),'NOT_CONNECTED');assert.equal(calls,0);
});
test('staged persistence keeps exact settlement/approval references, unique events and no mutation policies',()=>{
 const sql=fs.readFileSync(path.join(root,'tools/staged-migrations/032_financial_adjustments.sql'),'utf8');
 const repo=fs.readFileSync(path.join(root,base,'infrastructure/pg-adjustment.repository.ts'),'utf8');
 assert(sql.includes('PRIMARY KEY(provider_id,adjustment_id)'));assert(sql.includes('CHECK(submitted_by<>approved_by)'));assert(sql.includes('FOREIGN KEY(organization_id,approval_id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx)'));
 assert(!/FOR (UPDATE|DELETE) TO PUBLIC/.test(sql));assert(repo.includes('pg_advisory_xact_lock(hashtext($1))'));assert(repo.includes('Adjustment migration is staged'));assert(!repo.includes('UPDATE public.billing_invoices'));
});
