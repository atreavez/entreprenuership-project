'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src/contexts/billing');
function load(file,imports={}){
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,AbortController,setTimeout,clearTimeout,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});return m.exports;
}
const policy=load('domain/commercial-policy.ts'),reconciliation=load('application/reconciliation.service.ts'),{PaymentAdapterRegistry,ReconciliationService}=reconciliation;
const org='12345678-1234-4234-8234-123456789abc',id='22345678-1234-4234-8234-123456789abc',actor={id:'32345678-1234-4234-8234-123456789abc',organizationId:org};
const request={organizationId:org,invoiceId:id,providerId:'offline',transactionId:'tx1'},obs={...request,currency:'UGX',amountUgx:25000,state:'SETTLED'};
function service({allowed=true,observation=obs,observe,adapters,timeout=100}={}){
 const calls=[];const state={allowed};
 const registry=new PaymentAdapterRegistry(adapters??[{providerId:'offline',observe:observe??(async(tx,signal)=>{calls.push(['observe',tx,signal]);return observation;})}]);
 const gate={authorized:()=>state.allowed},repo={settle:async(r,o)=>{calls.push(['settle',r,o]);return 'SETTLED';}};
 return {calls,state,svc:new ReconciliationService(registry,gate,repo,timeout)};
}
test('disabled or missing adapter never calls provider or persistence',async()=>{
 for(const options of [{allowed:false},{adapters:[]}]){
  const f=service(options);assert.equal(await f.svc.reconcile(request),'NOT_CONNECTED');assert.equal(f.calls.length,0);
 }
 assert.throws(()=>new PaymentAdapterRegistry([{providerId:'x',observe:async()=>null},{providerId:'x',observe:async()=>null}]));
});
test('only independently observed exact settled locator reaches repository',async()=>{
 for(const bad of [{transactionId:'wrong'},{invoiceId:'wrong'},{organizationId:'wrong'},{currency:'USD'},{providerId:'wrong'},{amountUgx:'25000'},{state:'FAILED'}]){
  const f=service({observation:{...obs,...bad}});assert.equal(await f.svc.reconcile(request),'REVIEW_REQUIRED');assert.equal(f.calls.length,1);
 }
 for(const observation of [null,{...obs,state:'PENDING'}]){
  const f=service({observation});assert.equal(await f.svc.reconcile(request),'PENDING');assert.equal(f.calls.length,1);
 }
 const f=service();assert.equal(await f.svc.reconcile(request),'SETTLED');assert.equal(f.calls[0][1],'tx1');assert.equal(f.calls[1][0],'settle');assert(Object.isFrozen(f.calls[1][2]));
});
test('revoked dispatch and expired observation never settle',async()=>{
 let f;f=service({observe:async()=>{f.state.allowed=false;return obs;}});
 assert.equal(await f.svc.reconcile(request),'NOT_CONNECTED');assert.equal(f.calls.length,0);
 let aborted=false;const slow=service({timeout:5,observe:(_id,signal)=>new Promise(resolve=>{signal.addEventListener('abort',()=>{aborted=true;resolve(obs);},{once:true});})});
 assert.equal(await slow.svc.reconcile(request),'RETRY_REQUIRED');assert(aborted);assert.equal(slow.calls.length,0);
});
const {hasPaidEntitlement}=load('application/entitlement-policy.ts',{'../domain/commercial-policy':policy});
test('capability mapping defaults deny, enforces tenant and exclusive term end',()=>{
 const term={organizationId:org,code:'plan',startsAt:100,endsAt:200},map=[{capability:'REPORTS.PREMIUM',serviceCodes:['plan']}];
 assert(hasPaidEntitlement(org,'REPORTS.PREMIUM',100,[term],map));
 for(const [tenant,cap,now,mappings] of [['other','REPORTS.PREMIUM',100,map],[org,'UNMAPPED',100,map],[org,'REPORTS.PREMIUM',200,map],[org,'REPORTS.PREMIUM',99,map],[org,'REPORTS.PREMIUM',100,[]],[org,'REPORTS.PREMIUM',100,[...map,...map]]])assert(!hasPaidEntitlement(tenant,cap,now,[term],mappings));
});
const catalog={version:1,prices:[{code:'plan',unitUgx:25000,periodDays:30}]},initial=policy.draftInvoice(id,org,catalog,1,[{code:'plan',quantity:1}]),issued=policy.issueInvoice(initial,0,1).invoice;
const {PgSettlementRepository}=load('infrastructure/pg-settlement.repository.ts',{
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async(tx,o)=>tx.query('SCOPE',[o])},
 './billing-activation':{requireBillingActivation:async tx=>tx.query('ACTIVATION')},
 './pg-billing.repository':{hydrateInvoice:async(_tx,row)=>row},
 '../domain/commercial-policy':policy,'../application/reconciliation.service':reconciliation
});
function persistence(options={}){
 const calls=[];const role='assettrust_billing_worker_test';
 const invoice=options.invoice??issued;
 const tx={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql==='ACTIVATION'||sql==='SCOPE')return {rows:[]};
  if(sql.includes('FROM pg_roles'))return {rows:[{name:options.wrongRole?'normal_api':role,login:role,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,can_settle:true,can_record:true,inherited_membership:false,schema_create:false,database_create:false,unsafe_financial_ddl:false,immutable_update:false,price_update:false,forbidden_insert:!!options.unsafeGrants}]};
  if(sql.includes('FROM users'))return {rows:options.inactive?[]:[{id:actor.id}]};
  if(sql.includes('FROM public.billing_invoices'))return {rows:[invoice]};
  if(sql.includes('FROM public.billing_settlements'))return {rows:[{provider_id:'offline',transaction_id:'tx1',amount_ugx:25000,currency:'UGX'}]};
  if(sql.includes('FROM public.billing_journal'))return {rows:options.missingJournal?[]:[{amount_ugx:25000}]};
  if(sql.includes('FROM public.billing_catalog_versions'))return {rows:[catalog]};
  if(sql.includes('pg_advisory_xact_lock(hashtext($1))'))return {rows:[]};
  if(sql.includes('FROM public.billing_subscriptions t'))return {rows:options.renewalRows??[]};
  if(sql.includes('AS now_ms'))return {rows:[{now_ms:'1000'}]};
  if(sql.startsWith('INSERT INTO public.billing_settlements'))return {rowCount:options.duplicate?0:1,rows:[]};
  if(sql.startsWith('UPDATE public.billing_invoices'))return {rowCount:options.stale?0:1,rows:[]};
  if(sql.startsWith('INSERT'))return {rowCount:1,rows:[]};
  throw Error('Unexpected SQL '+sql);
 }};
 const db={transaction:async fn=>{calls.push({sql:'BEGIN'});try{const result=await fn(tx);calls.push({sql:'COMMIT'});return result;}catch(e){calls.push({sql:'ROLLBACK'});throw e;}}};
 const audit={write:async(connection,u,action,entity,invoiceId,detail)=>{assert.equal(connection,tx);assert.equal(u,actor);calls.push({sql:'AUDIT',args:[action,entity,invoiceId,detail]});}};
 return {calls,repo:new PgSettlementRepository(db,audit,{authorized:()=>true},()=>actor,role,async()=>!options.lostLease)};
}
test('atomic paid transition, clearing posting and eligible subscription use persisted clock',async()=>{
 const f=persistence();assert.equal(await f.repo.settle(request,obs),'SETTLED');
 const lookup=s=>f.calls.find(c=>c.sql.startsWith(s));
 assert(lookup('INSERT INTO public.billing_settlements'));
 assert(lookup('UPDATE public.billing_invoices').args[4]===JSON.stringify(['offline','tx1']));
 assert.deepEqual(Array.from(lookup('INSERT INTO public.billing_subscriptions').args),[org,id,'plan',1,1000,1000+30*86400000]);
 assert.equal(lookup('AUDIT').args[3].subscriptionState,'RECORDED');assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('duplicate reference cannot change another invoice; incomplete writes roll back',async()=>{
 const duplicate=persistence({duplicate:true});assert.equal(await duplicate.repo.settle(request,obs),'REVIEW_REQUIRED');
 assert(!duplicate.calls.some(c=>c.sql.startsWith('UPDATE')||c.sql==='AUDIT'));
 for(const opts of [{wrongRole:true},{inactive:true},{missingJournal:true},{stale:true}]){
  const f=persistence(opts);await assert.rejects(f.repo.settle(request,obs));assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert(!f.calls.some(c=>c.sql==='AUDIT'));
 }
});
test('recorded settlement replay is read-only',async()=>{
 const paid=policy.reconcilePayment(issued,1,'offline',obs).invoice,f=persistence({invoice:paid});
 assert.equal(await f.repo.settle(request,obs),'ALREADY_SETTLED');assert(!f.calls.some(c=>/^(INSERT|UPDATE|AUDIT)/.test(c.sql)));
});
test('ordinary API remains disconnected and cannot invoke settlement worker',()=>{
 const api=fs.readFileSync(path.join(root,'infrastructure/billing.module.ts'),'utf8'),repo=fs.readFileSync(path.join(root,'infrastructure/pg-billing.repository.ts'),'utf8');
 assert(!api.includes('PgSettlementRepository'));assert(!api.includes('ReconciliationService'));assert(repo.includes("transition.invoice.state==='PAID'"));assert(api.includes("paymentState:'NOT_CONNECTED'"));
});

test('lost or revoked queue lease blocks settlement before invoice access',async()=>{
 const f=persistence({lostLease:true});assert.equal(await f.repo.settle(request,obs),'REVIEW_REQUIRED');
 assert(!f.calls.some(c=>c.sql.includes('FROM public.billing_invoices')||c.sql.startsWith('INSERT')));
});

test('dedicated worker with excess financial grants refuses settlement',async()=>{
 const f=persistence({unsafeGrants:true});await assert.rejects(f.repo.settle(request,obs));
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert(!f.calls.some(c=>c.sql.startsWith('INSERT')));
});

test('same-service renewal preserves prepaid time in settlement transaction',async()=>{
 const oldEnd=1000+30*86400000;
 const f=persistence({renewalRows:[{organization_id:org,funding_invoice_id:'42345678-1234-4234-8234-123456789abc',code:'plan',catalog_version:1,starts_at:1000,ends_at:oldEnd}]});
 assert.equal(await f.repo.settle(request,obs),'SETTLED');
 const lock=f.calls.findIndex(c=>c.sql.includes('pg_advisory_xact_lock(hashtext($1))'));
 const read=f.calls.findIndex(c=>c.sql.includes('FROM public.billing_subscriptions t'));
 const write=f.calls.findIndex(c=>c.sql.startsWith('INSERT INTO public.billing_subscriptions'));
 assert(lock>=0&&lock<read&&read<write);assert.equal(f.calls[write].args[4],oldEnd);assert.equal(f.calls[write].args[5],oldEnd+30*86400000);
});
