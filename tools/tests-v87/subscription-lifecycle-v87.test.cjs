'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),base='apps/api/src/contexts/billing/';
function load(file,imports={}){
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(read(base+file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});return m.exports;
}
const d=load('domain/commercial-policy.ts'),org='12345678-1234-4234-8234-123456789abc',id='22345678-1234-4234-8234-123456789abc',oldId='32345678-1234-4234-8234-123456789abc',day=86400000;
const cat={version:1,prices:[{code:'plan',unitUgx:25000,periodDays:30}]},issued=d.issueInvoice(d.draftInvoice(id,org,cat,1,[{code:'plan',quantity:1}]),0,1).invoice;
const paid=d.reconcilePayment(issued,1,'offline',{providerId:'offline',transactionId:'tx1',invoiceId:id,organizationId:org,currency:'UGX',amountUgx:25000,state:'SETTLED'}).invoice;
const old={organizationId:org,code:'plan',catalogVersion:1,startsAt:1000,endsAt:1000+30*day,fundingInvoiceId:oldId};
const config={enabled:true,graceDays:2,mappings:[{capability:'BILLING.JOURNAL_EXPORT',serviceCodes:['plan']}]};
test('renewal stacks remaining prepaid time; expired terms start at current clock',()=>{
 assert.equal(d.renewPaidSubscription(paid,cat,'plan',2000,[old]).startsAt,old.endsAt);
 assert.equal(d.renewPaidSubscription(paid,cat,'plan',old.endsAt+1,[old]).startsAt,old.endsAt+1);
 assert.throws(()=>d.renewPaidSubscription(paid,cat,'plan',2000,[{...old,fundingInvoiceId:id}]));
 assert.throws(()=>d.renewPaidSubscription(paid,cat,'plan',2000,[{...old,organizationId:'other'}]));
 assert.throws(()=>d.renewPaidSubscription(issued,cat,'plan',2000,[]));
});
test('optional entitlement uses exact expiry, bounded grace, no core capability or future term access',()=>{
 const policy=d.parseEntitlementPolicyText(JSON.stringify(config),1),cap='BILLING.JOURNAL_EXPORT';
 assert.equal(d.commercialAccess(policy,org,cap,old.startsAt,[old]),'ACTIVE');
 assert.equal(d.commercialAccess(policy,org,cap,old.endsAt,[old]),'GRACE');
 assert.equal(d.commercialAccess(policy,org,cap,old.endsAt+2*day,[old]),'DENIED');
 assert.equal(d.commercialAccess(policy,org,cap,old.startsAt-1,[old]),'DENIED');
 assert.equal(d.commercialAccess(null,org,cap,old.startsAt,[old]),'DENIED');
 assert.equal(d.commercialAccess(policy,org,'DOCUMENTS.READ',old.startsAt,[old]),'DENIED');
 assert.throws(()=>d.parseEntitlementPolicyText(JSON.stringify({...config,graceDays:8}),1));
});
class ForbiddenException extends Error{}
const deco=()=>()=>{};
function fixture({authorized=true,approved=true,term=true}={}){
 const calls=[],tx={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('pg_advisory'))return {rows:[]};
  if(sql.includes('admin_configuration_values'))return {rows:approved?[{version:1,value:JSON.stringify(config)}]:[]};
  if(sql.includes('AS now_ms'))return {rows:[{now_ms:2000}]};
  if(sql.includes('FROM public.billing_subscriptions t'))return {rows:term?[{organization_id:org,code:'plan',catalog_version:1,funding_invoice_id:oldId,starts_at:old.startsAt,ends_at:old.endsAt}]:[]};
  if(sql.includes('FROM public.billing_journal WHERE'))return {rows:Array.from({length:1001},()=>({amount_ugx:'25000'}))};
  throw Error('Unexpected SQL '+sql);
 }};
 const {CommercialEntitlementsService}=load('infrastructure/commercial-entitlements.module.ts',{
 '@nestjs/common':{Controller:deco,Get:deco,Req:deco,UseGuards:deco,Injectable:deco,Module:deco,ForbiddenException},'../../../database':{},'../../../auth':{AuthModule:class{},AuthGuard:class{}},
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async()=>calls.push({sql:'SCOPE'})},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminStepUp:async()=>{calls.push({sql:'MFA'});if(!authorized)throw new ForbiddenException();}},
 './adjustment-activation':{adjustmentSchemaReleased:async()=>false,adjustmentOrganizationLock:org=>org},
 './billing-activation':{requireBillingActivation:async()=>calls.push({sql:'SCHEMA'})},'../domain/commercial-policy':d});
 return {calls,svc:new CommercialEntitlementsService({transaction:async fn=>fn(tx)})};
}
test('entitlement is additive to current MFA and verified settlement, not resource authorization replacement',async()=>{
 const actor={id,organizationId:org};
 for(const options of [{authorized:false},{approved:false},{term:false}]){
  const f=fixture(options);await assert.rejects(f.svc.journalExport(actor,'sid'),ForbiddenException);
  assert(!f.calls.some(c=>c.sql.includes('FROM public.billing_journal WHERE')));
 }
 const f=fixture(),r=await f.svc.journalExport(actor,'sid');
 assert.equal(r.entries.length,1000);assert.equal(r.truncated,true);assert.equal(r.access,'ACTIVE');
 assert.equal(f.calls[1].sql,'MFA');const terms=f.calls.find(c=>c.sql.includes('FROM public.billing_subscriptions t'));
 assert(terms.sql.includes('JOIN public.billing_settlements'));assert(terms.sql.includes("j.event='PAID'"));assert.equal(terms.args[0],org);
});
test('API role cannot insert subscription terms and only the optional export is gated',()=>{
 const db=read('apps/api/src/database.ts'),grants=read('tools/provision-ci-runtime-role-v57.mjs'),repo=read(base+'infrastructure/pg-billing.repository.ts');
 assert(db.includes("has_any_column_privilege(current_user,'public.billing_subscriptions','INSERT')"));
 assert(grants.includes('REVOKE INSERT ON TABLE public.billing_subscriptions'));assert(!repo.includes('INSERT INTO public.billing_subscriptions'));
 for(const p of ['assets.ts','cases.ts','documents.ts'])assert(!read('apps/api/src/'+p).includes('commercialAccess'));
});
