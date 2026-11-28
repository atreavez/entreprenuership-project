'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),base='apps/api/src/contexts/billing/';
function load(file,imports={}){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,base,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});
 return m.exports;
}
const d=load('domain/refund-review.ts'),author='12345678-1234-4234-8234-123456789abc',reviewer='22345678-1234-4234-8234-123456789abc',invoice='32345678-1234-4234-8234-123456789abc';
const input={invoiceId:invoice,adjustmentId:'refund1',amountUgx:10000,reason:'Verified refund review'};
test('refund review input excludes tenant, provider, reviewer and payment state claims',()=>{
 assert.equal(d.parseRefundRequest(input).amountUgx,10000);
 for(const b of [{...input,organizationId:author},{...input,approvedBy:reviewer},{...input,providerId:'x'},{...input,state:'CONFIRMED'},{...input,amountUgx:'10000'},{...input,reason:'short'}])assert.throws(()=>d.parseRefundRequest(b));
 assert.throws(()=>d.parseRefundDecision({decision:'APPROVE',reason:input.reason,amountUgx:1}));
 assert.equal(d.parseRefundDecision({decision:'REJECT',reason:input.reason}).decision,'REJECT');
});
test('independent reviewer cannot approve beyond retained and unreserved amount',()=>{
 assert(d.canApproveRefund(author,reviewer,25000,5000,10000,10000));
 assert(!d.canApproveRefund(author,reviewer,25000,5000,10000,10001));
 assert(!d.canApproveRefund(author,author,25000,0,0,1));
 assert(!d.canApproveRefund(author,reviewer,25000,-1,0,1));
 assert(!d.canApproveRefund(author,reviewer,25000,20000,6000,1));
});
class ServiceUnavailableException extends Error{}
const tables=['billing_refund_requests','billing_refund_decisions','billing_refund_approvals','billing_adjustments'];
function gate(m,p){return load('infrastructure/adjustment-activation.ts',{'@nestjs/common':{ServiceUnavailableException},'../../platform/domain/schema-manifest':{REQUIRED_SCHEMA_MIGRATIONS:m},'../../tenant-isolation/domain/rls-policy-contract':{PROTECTED_TABLES:p}});}
test('activation rejects partial inventory and mismatched checksum',async()=>{
 const tx={query:async()=>({rows:[{sha256:'exact'}]})},m=[{filename:'032_financial_adjustments.sql',sha256:'exact'}];
 assert.equal(await gate([],[]).adjustmentSchemaReleased(tx),false);
 await assert.rejects(gate([],[]).requireAdjustmentSchema(tx),ServiceUnavailableException);
 await assert.rejects(gate(m,tables.slice(1)).adjustmentSchemaReleased(tx),ServiceUnavailableException);
 await assert.rejects(gate(m,tables).adjustmentSchemaReleased({query:async()=>({rows:[{sha256:'wrong'}]})}),ServiceUnavailableException);
 assert.equal(await gate(m,tables).adjustmentSchemaReleased(tx),true);
});
test('review decisions and approvals are append-only, exact and tenant-bound',()=>{
 const sql=fs.readFileSync(path.join(root,'tools/staged-migrations/032_financial_adjustments.sql'),'utf8');
 const admin=fs.readFileSync(path.join(root,base,'infrastructure/refund-admin.module.ts'),'utf8');
 assert(!/FOR (UPDATE|DELETE) TO PUBLIC/.test(sql));
 assert(sql.includes('REFERENCES public.billing_refund_decisions(organization_id,request_id,reviewer_id,decision)'));
 assert(admin.includes('await assertCurrentAdminStepUp(tx,a,sid);await requireAdjustmentSchema(tx)'));
 assert(admin.includes('r.submitted_by===a.id'));assert(admin.includes('canApproveRefund(r.submitted_by,a.id'));
 assert(!admin.includes('INSERT INTO public.billing_adjustments'));
});
test('entitlement and renewal queries exclude adjusted funding only after reviewed activation',()=>{
 for(const file of ['commercial-entitlements.module.ts','pg-settlement.repository.ts']){
  const src=fs.readFileSync(path.join(root,base,'infrastructure',file),'utf8');
  assert(src.includes('await adjustmentSchemaReleased(tx)'));
  assert(src.includes('a.organization_id=t.organization_id AND a.invoice_id=t.funding_invoice_id'));
  assert(src.includes('pg_advisory_xact_lock_shared(hashtext($1))'));
 }
});
