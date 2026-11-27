'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const file=path.resolve(__dirname,'../../apps/api/src/contexts/billing/domain/commercial-policy.ts'),m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports});
const {draftInvoice,issueInvoice,voidInvoice,reconcilePayment,paidSubscription,subscriptionActive,validateCatalog}=m.exports;
const org='12345678-1234-4234-8234-123456789abc',id='22345678-1234-4234-8234-123456789abc';
const catalog={version:1,prices:[{code:'review',unitUgx:25000,periodDays:null},{code:'workspace',unitUgx:99000,periodDays:30}]};
const draft=(code='review',quantity=1)=>draftInvoice(id,org,catalog,1,[{code,quantity}]);
const issued=()=>issueInvoice(draft(),0,1).invoice;
const obs=(invoice,overrides={})=>({providerId:'mock',transactionId:'tx1',invoiceId:invoice.id,organizationId:org,currency:'UGX',amountUgx:invoice.totalUgx,state:'SETTLED',...overrides});
const balanced=entries=>assert.equal(entries.reduce((n,e)=>n+e.debit-e.credit,0),0);
test('server catalog determines price and immutable line snapshots',()=>{
 const d=draft('review',3);assert.equal(d.totalUgx,75000);assert.equal(d.lines[0].unitUgx,25000);assert(Object.isFrozen(d.lines[0]));
 assert.throws(()=>draftInvoice(id,org,catalog,2,[{code:'review',quantity:1}]));
 assert.throws(()=>draftInvoice(id,org,catalog,1,[{code:'review',quantity:1,unitUgx:1}]));
});
test('strict amount and catalog validation',()=>{
 for(const q of [0,-1,1.5,'1',null,true,10001])assert.throws(()=>draft('review',q));
 assert.throws(()=>draft('not-listed'));
 assert.throws(()=>draftInvoice(id,org,catalog,1,[{code:'review',quantity:1},{code:'review',quantity:2}]));
 assert.throws(()=>validateCatalog({version:1,prices:[{code:'x',unitUgx:0,periodDays:null}]}));
 assert.throws(()=>draftInvoice(id,org,{version:1,prices:[{code:'x',unitUgx:1000000000,periodDays:null}]},1,[{code:'x',quantity:2}]));
});
test('issue and void produce balanced, opposite postings; stale draft prices are rejected',()=>{
 const d=draft(),i=issueInvoice(d,0,1);balanced(i.entries);assert.equal(i.invoice.state,'ISSUED');
 const v=voidInvoice(i.invoice,1);balanced(v.entries);assert.equal(v.invoice.state,'VOID');assert.equal(v.entries[0].debit,i.invoice.totalUgx);
 assert.throws(()=>issueInvoice(d,0,2));assert.throws(()=>voidInvoice(i.invoice,0));
 assert.equal(voidInvoice(d,0).entries.length,0);
});
test('only exact trusted settlement can pay an issued invoice',()=>{
 const i=issued();
 for(const bad of [{state:'PENDING'},{state:'FAILED'},{amountUgx:1},{currency:'USD'},{providerId:'other'},{invoiceId:'other'},{organizationId:'other'},{transactionId:''}])assert.throws(()=>reconcilePayment(i,1,'mock',obs(i,bad)));
 const p=reconcilePayment(i,1,'mock',obs(i));balanced(p.entries);assert.equal(p.invoice.state,'PAID');
 const replay=reconcilePayment(p.invoice,1,'mock',obs(i));assert.equal(replay.entries.length,0);assert.equal(replay.invoice,p.invoice);
 assert.throws(()=>reconcilePayment(p.invoice,2,'mock',obs(i,{transactionId:'tx2'})));
 assert.throws(()=>voidInvoice(p.invoice,2));
});
test('paid subscription uses a fixed versioned term and exclusive end boundary',()=>{
 const i=issueInvoice(draft('workspace'),0,1).invoice;
 assert.throws(()=>paidSubscription(i,catalog,'workspace',1000));
 const p=reconcilePayment(i,1,'mock',obs(i)).invoice,s=paidSubscription(p,catalog,'workspace',1000);
 assert.equal(s.endsAt,1000+30*86400000);assert.equal(s.fundingInvoiceId,id);
 assert.equal(subscriptionActive(s,999),false);assert.equal(subscriptionActive(s,1000),true);assert.equal(subscriptionActive(s,s.endsAt),false);
 assert.throws(()=>paidSubscription(p,{...catalog,version:2},'workspace',1000));
});
