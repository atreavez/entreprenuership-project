'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const file=path.resolve(__dirname,'../../apps/api/src/contexts/admin-control/domain/configuration-policy.ts');
function loadDomain(name,imports={}){const code=ts.transpileModule(fs.readFileSync(name,'utf8'),{fileName:name,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,require(id){if(Object.hasOwn(imports,id))return imports[id];throw Error('domain may not import infrastructure')}},{filename:name,timeout:5000});return m.exports;}
function get(){const anchor=loadDomain(path.resolve(path.dirname(file),'../../anchoring/domain/anchor-job-policy.ts'));const billing=loadDomain(path.resolve(path.dirname(file),'../../billing/domain/commercial-policy.ts'));return loadDomain(file,{'../../anchoring/domain/anchor-job-policy':anchor,'../../billing/domain/commercial-policy':billing});}
const allowedValue=(v)=>JSON.parse(JSON.stringify(v));
test('catalog includes only explicitly approved keys and scopes',()=>{const d=get();assert(d.catalog('organization').some(x=>x.key==='workspace.display_name'));assert(d.catalog('platform').some(x=>x.key==='branding.product_name'));assert(!d.catalog('organization').some(x=>x.key==='branding.product_name'));});
test('unknown, security, official-registry and audit rewrite keys rejected',()=>{const d=get();for(const k of ['audit_event.delete','auth.disable_mfa','registry.official_title','security.allow_all','__proto__'])assert.throws(()=>d.prepareChange('organization',k,'anything'),/unsupported/i);});
test('normalizes safe text and rejects control characters and oversized content',()=>{const d=get();assert.equal(d.prepareChange('organization','workspace.display_name','  Kampala Registry Team  ').value,'Kampala Registry Team');assert.throws(()=>d.prepareChange('organization','workspace.display_name','a'.repeat(200)),/length/i);assert.throws(()=>d.prepareChange('organization','workspace.display_name','hi\u0000bye'),/control/i);});
test('enforces email and currency formats',()=>{const d=get();assert.equal(d.prepareChange('platform','billing.default_currency','ugx').value,'UGX');assert.throws(()=>d.prepareChange('platform','billing.default_currency','UGX\n'),/invalid/i);assert.throws(()=>d.prepareChange('organization','workspace.support_email','not-email'),/invalid/i);});
test('numeric SLA target is bounded, not arbitrary JSON or SQL',()=>{const d=get();assert.equal(d.prepareChange('organization','workflow.review_target_days',30).value,30);for(const n of [-1,0,366,1.2,'20'])assert.throws(()=>d.prepareChange('organization','workflow.review_target_days',n),/invalid/i);});
test('critical global changes require independent approval',()=>{const d=get();assert.equal(d.prepareChange('platform','billing.default_currency','UGX').requiresApproval,true);assert.equal(d.prepareChange('platform','branding.product_name','Trust').requiresApproval,false);});
test('high-impact organization change requires independent approval',()=>{const d=get();assert.equal(d.prepareChange('organization','workflow.review_target_days',21).requiresApproval,true);});
test('no config can enable bypass of mandatory final-review independence',()=>{const d=get();assert(!d.catalog('platform').concat(d.catalog('organization')).some(x=>/mfa|admin_count|disable_audit|legal_title|final_review_approval_override/.test(x.key)));});
test('rejects unsafe version, scope and decision values',()=>{const d=get();for(const n of [-1,1.25,'0',NaN])assert.throws(()=>d.assertExpectedVersion(n),/version/i);assert.equal(d.assertExpectedVersion(0),0);assert.throws(()=>d.catalog('other'),/scope/i);assert.throws(()=>d.assertDecision('DELETE'),/decision/i);});
test('application publication decisions do not reveal unapproved values',()=>{const d=get();assert.equal(d.effectiveValue({scope:'organization',key:'workspace.display_name',status:'PENDING',value:'Not yet approved'}),'');assert.equal(d.effectiveValue({scope:'organization',key:'workspace.display_name',status:'ACTIVE',value:'Approved'}),'Approved');});

test('commercial price catalog is platform-only and requires independent approval',()=>{
 const d=get(),value=JSON.stringify([{code:'review',unitUgx:25000,periodDays:null}]);
 const result=d.prepareChange('platform','billing.price_catalog',value);assert.equal(result.requiresApproval,true);assert.equal(result.value,value);
 assert.throws(()=>d.prepareChange('organization','billing.price_catalog',value));
 for(const input of ['{}','[]','bad',JSON.stringify([{code:'review',unitUgx:'25000',periodDays:null}])])assert.throws(()=>d.prepareChange('platform','billing.price_catalog',input));
});
