'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const m={exports:{}},source=path.resolve(__dirname,'../../apps/api/src/contexts/billing/domain/financial-consistency.ts');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports});
const {supportedPurchase,inspectFinancialSnapshot}=m.exports;
const day=86400000;
const prices=[{code:'plan',unitUgx:25000,periodDays:30},{code:'review',unitUgx:5000,periodDays:null}];
const invoice={id:'invoice',organizationId:'org',catalogVersion:1,state:'PAID',revision:2,totalUgx:25000,currency:'UGX',paymentKey:'["offline","tx1"]',lines:[{code:'plan',quantity:1,unitUgx:25000,totalUgx:25000}]};
const issued={revision:1,event:'ISSUED',debitAccount:'RECEIVABLE',creditAccount:'DEFERRED_SERVICE_REVENUE',amountUgx:25000};
const paid={revision:2,event:'PAID',debitAccount:'PAYMENT_CLEARING',creditAccount:'RECEIVABLE',amountUgx:25000};
const settlement={providerId:'offline',transactionId:'tx1',amountUgx:25000,currency:'UGX'};
const term={organizationId:'org',fundingInvoiceId:'invoice',code:'plan',catalogVersion:1,startsAt:1000,endsAt:1000+30*day};
const snapshot=()=>({invoice:{...invoice},prices,journal:[issued,paid],settlements:[settlement],terms:[term]});
const issues=s=>Array.from(inspectFinancialSnapshot(s));
test('new purchases support one-time lines or one recurring service only',()=>{
 assert(supportedPurchase([{code:'review',quantity:3}],prices));
 assert(supportedPurchase([{code:'plan',quantity:1}],prices));
 for(const items of [[],[{code:'plan',quantity:2}],[{code:'plan',quantity:1},{code:'review',quantity:1}],[{code:'unknown',quantity:1}]])assert(!supportedPurchase(items,prices));
});
test('complete paid invoice, issued invoice, draft and voided invoices are consistent',()=>{
 assert.deepEqual(issues(snapshot()),[]);
 for(const [state,revision,journal] of [['DRAFT',0,[]],['ISSUED',1,[issued]],['VOID',1,[]],['VOID',2,[issued,{...paid,event:'VOID',debitAccount:'DEFERRED_SERVICE_REVENUE'}]]]){
  assert.deepEqual(issues({...snapshot(),invoice:{...invoice,state,revision,paymentKey:null},journal,settlements:[],terms:[]}),[]);
 }
});
test('changed historical price or journal pair is detected',()=>{
 assert(issues({...snapshot(),invoice:{...invoice,totalUgx:1}}).includes('PRICE_SNAPSHOT_INVALID'));
 assert(issues({...snapshot(),journal:[paid]}).includes('JOURNAL_MISMATCH'));
 assert(issues({...snapshot(),journal:[issued,{...paid,amountUgx:1}]}).includes('JOURNAL_MISMATCH'));
 assert(issues({...snapshot(),journal:[issued,{...paid,debitAccount:'RECEIVABLE'}]}).includes('JOURNAL_MISMATCH'));
});
test('missing, duplicated, wrong currency or wrong reference settlement is detected',()=>{
 for(const settlements of [[],[settlement,settlement],[{...settlement,currency:'USD'}],[{...settlement,transactionId:'tx2'}],[{...settlement,amountUgx:1}]])assert(issues({...snapshot(),settlements}).includes('SETTLEMENT_MISMATCH'));
 assert(issues({...snapshot(),invoice:{...invoice,state:'ISSUED',revision:1,paymentKey:null},journal:[issued]}).includes('UNEXPECTED_SETTLEMENT'));
});
test('subscription must match paid invoice, service, price version and fixed duration',()=>{
 for(const terms of [[],[term,term],[{...term,organizationId:'foreign'}],[{...term,fundingInvoiceId:'different'}],[{...term,catalogVersion:2}],[{...term,code:'review'}],[{...term,endsAt:term.endsAt+day}]])assert(issues({...snapshot(),terms}).includes('SUBSCRIPTION_FUNDING_MISMATCH'));
 assert(issues({...snapshot(),invoice:{...invoice,state:'DRAFT',revision:0,paymentKey:null},journal:[],settlements:[]}).includes('UNEXPECTED_SUBSCRIPTION'));
});
test('legacy mixed recurring payment needs allocation review rather than invented entitlement',()=>{
 const s=snapshot();s.invoice.lines=[...invoice.lines,{code:'review',quantity:1,unitUgx:5000,totalUgx:5000}];s.invoice.totalUgx=30000;s.journal=s.journal.map(j=>({...j,amountUgx:30000}));s.settlements=[{...settlement,amountUgx:30000}];s.terms=[];
 assert.deepEqual(issues(s),['SUBSCRIPTION_ALLOCATION_REVIEW']);
});
