'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const page=read('apps/web/src/BillingPage.tsx'),editor=read('apps/web/src/BillingCatalogEditor.tsx'),app=read('apps/web/src/App.tsx'),admin=read('apps/web/src/AdminControlPage.tsx');
test('billing route is tenant keyed, admin only and read-only in design preview',()=>{
 assert(app.includes("page==='billing'?<BillingPage key={user.organizationId+':'+user.id}"));
 assert(app.includes("'anchoring','billing'].includes(n.id)"));
 assert(page.includes("role==='ORG_ADMIN'&&!DEMO"));
 assert(page.includes('n!==generation.current'));
 assert(page.includes('if(!permitted||!loaded||locked.current||loading)return'));
});
test('checkout sends only selected codes, quantities and approved catalog revision',()=>{
 assert(page.includes("{expectedCatalogVersion:catalog.version,items}"));
 assert(page.includes("{code:p.code,quantity:Number(quantities[p.code])}"));
 assert(page.includes("{expectedRevision:i.revision,action:confirmation.action}"));
 assert(page.includes("catalog?.version!==i.catalogVersion"));
 assert(!page.includes("action:'PAID'"));assert(page.includes('Payment collection is not connected.'));
});
test('journal and subscription viewers use tenant-scoped MFA-protected endpoints',()=>{
 const api=read('apps/api/src/contexts/billing/infrastructure/billing.module.ts'),repo=read('apps/api/src/contexts/billing/infrastructure/pg-billing.repository.ts');
 for(const name of ['journal','subscriptions']){
  assert(page.includes("'/billing/"+name+"'"));assert(api.includes("@Get('"+name+"')"));assert(api.includes('tx.'+name+'(actor.organizationId)'));
  assert(repo.includes('FROM public.billing_'+name+' WHERE organization_id=$1'));
 }
 assert(repo.includes('await assertCurrentAdminStepUp(connection,this.actor,this.sessionId)'));
});
test('catalog editor validates integer prices, unique codes and term bounds',()=>{
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(editor,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,{module:m,exports:m.exports,require:n=>{assert.equal(n,'react');return {};}});
 const valid=m.exports.validBillingCatalog;
 const p={code:'review',unitUgx:25000,periodDays:null};
 assert(valid(JSON.stringify([p])));
 for(const v of ['', 'bad','[]',JSON.stringify([p,p]),JSON.stringify([{...p,unitUgx:1.5}]),JSON.stringify([{...p,unitUgx:0}]),JSON.stringify([{...p,periodDays:367}]),JSON.stringify([{...p,code:'bad code'}])])assert(!valid(v));
 assert(admin.includes("d.key==='billing.price_catalog'?<BillingCatalogEditor"));
 assert(admin.includes('!validBillingCatalog('));
 assert(admin.includes('expectedVersion:current?.version??0'));
});
