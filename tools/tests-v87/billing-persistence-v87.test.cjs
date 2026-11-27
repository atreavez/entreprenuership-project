'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),src='apps/api/src/contexts/billing/';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(file,imports={}){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(read(src+file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});
 return m.exports;
}
const policy=load('domain/commercial-policy.ts');
const {PgBillingRepository}=load('infrastructure/pg-billing.repository.ts',{
 '../domain/commercial-policy':policy,
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async(tx,org)=>tx.query('SCOPE',[org])},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminStepUp:async(tx,actor,sid)=>tx.query('MFA',[actor.id,sid])}
});
const {publishApprovedCatalog}=load('infrastructure/pg-catalog-publication.ts',{'../domain/commercial-policy':policy});
const organizationId='12345678-1234-4234-8234-123456789abc',invoiceId='22345678-1234-4234-8234-123456789abc',actor={id:'32345678-1234-4234-8234-123456789abc',organizationId};
const catalog={version:1,prices:[{code:'review',unitUgx:25000,periodDays:null}]};
const initial=policy.draftInvoice(invoiceId,organizationId,catalog,1,[{code:'review',quantity:2}]);
function fixture({authorized=true,stale=false,corrupt=false}={}){
 const calls=[];const tx={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql==='MFA'&&!authorized)throw Error('MFA denied');
  if(sql==='SCOPE'||sql==='MFA'||sql.includes('pg_advisory_xact_lock_shared'))return {rows:[]};
  if(sql.includes('FROM public.billing_catalog_versions'))return {rows:[catalog]};
  if(sql.includes('FROM public.billing_invoices'))return {rows:[{id:invoiceId,organization_id:organizationId,catalog_version:1,lines:initial.lines,total_ugx:corrupt?1:50000,currency:'UGX',state:'DRAFT',revision:0,payment_key:null}]};
  if(sql.startsWith('INSERT')||sql.startsWith('UPDATE'))return {rows:[],rowCount:stale&&sql.startsWith('UPDATE')?0:1};
  throw Error('Unexpected SQL '+sql);
 }};
 const db={transaction:async fn=>fn(tx)},audit={write:async(connection,_actor,action)=>{assert.equal(connection,tx);calls.push({sql:'AUDIT '+action});}};
 return {calls,repo:new PgBillingRepository(db,audit,actor,'session')};
}
test('draft is calculated from approved catalog after same-transaction MFA',async()=>{
 const f=fixture(),d=await f.repo.transaction(organizationId,t=>t.createDraft(invoiceId,1,[{code:'review',quantity:2}]));
 assert.equal(d.totalUgx,50000);
 assert.equal(f.calls[0].sql,'SCOPE');assert.equal(f.calls[1].sql,'MFA');
 assert(f.calls.some(c=>c.sql.includes('INSERT INTO public.billing_invoices')&&c.params[4]===50000));
 assert.equal(f.calls.at(-1).sql,'AUDIT BILLING_DRAFT_CREATED');
});
test('issue rederives exact journal pair and writes audit in same transaction',async()=>{
 const f=fixture(),transition=policy.issueInvoice(initial,0,1);
 assert.equal(await f.repo.transaction(organizationId,t=>t.commit(organizationId,0,transition)),true);
 const journal=f.calls.find(c=>c.sql.includes('INSERT INTO public.billing_journal'));
 assert.deepEqual(Array.from(journal.params),[organizationId,invoiceId,1,'ISSUED','RECEIVABLE','DEFERRED_SERVICE_REVENUE',50000]);
 assert.equal(f.calls.at(-1).sql,'AUDIT BILLING_INVOICE_ISSUED');
});
test('stale revision, forged financial journal, corrupted price and untrusted paid transition fail closed',async()=>{
 const issue=policy.issueInvoice(initial,0,1);
 for(const [options,transition] of [[{}, {...issue,entries:[]}],[{corrupt:true},issue],[{}, {...issue,invoice:{...issue.invoice,state:'PAID'}}]]){
  const f=fixture(options);await assert.rejects(f.repo.transaction(organizationId,t=>t.commit(organizationId,0,transition)));
  assert(!f.calls.some(c=>c.sql.startsWith('UPDATE')||c.sql.startsWith('AUDIT')));
 }
 const stale=fixture({stale:true});assert.equal(await stale.repo.transaction(organizationId,t=>t.commit(organizationId,0,issue)),false);
 assert(!stale.calls.some(c=>c.sql.includes('INSERT INTO public.billing_journal')||c.sql.startsWith('AUDIT')));
});
test('tenant substitution and denied MFA never reach billing data',async()=>{
 const f=fixture();await assert.rejects(f.repo.transaction('another-tenant',()=>{}));assert.equal(f.calls.length,0);
 const denied=fixture({authorized:false});await assert.rejects(denied.repo.transaction(organizationId,t=>t.invoice(organizationId,invoiceId)));
 assert.equal(denied.calls.length,2);
});
test('publication needs applied independently approved proposal and a unique version',async()=>{
 const calls=[],tx={query:async(sql,args)=>{calls.push(sql);return {rows:sql.includes('SELECT c.id')?[{version:1,value:JSON.stringify(catalog.prices)}]:[],rowCount:1};}};
 assert.equal((await publishApprovedCatalog(tx,'change')).version,1);
 assert(calls[0].includes('pg_advisory_xact_lock('));assert(calls[1].includes('c.reviewed_by<>c.submitted_by'));assert(calls[1].includes('v.value=c.proposed_value'));
 await assert.rejects(publishApprovedCatalog({query:async()=>({rows:[]})},'change'));
});
test('reviewed migration protects tenant rows and append-only records',()=>{
 const sql=read('apps/api/sql/030_commercial_billing.sql');
 for(const table of ['billing_invoices','billing_journal','billing_settlements','billing_subscriptions']){
  assert(sql.includes('ALTER TABLE public.'+table+' FORCE ROW LEVEL SECURITY'));
  assert(sql.includes('CREATE POLICY '+table+'_select_v87'));
  assert(sql.includes('CREATE POLICY '+table+'_insert_v87'));
 }
 assert.equal((sql.match(/FOR UPDATE TO PUBLIC/g)||[]).length,1);
 assert(!/FOR DELETE TO PUBLIC/.test(sql));assert(sql.includes('PRIMARY KEY (provider_id,transaction_id)'));
 assert(sql.includes('PRIMARY KEY (organization_id,funding_invoice_id)'));
 assert(!fs.existsSync(path.join(root,'tools/staged-migrations/030_commercial_billing.sql')));
});
