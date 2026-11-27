'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(file,imports={}){
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});return m.exports;
}
class ServiceUnavailableException extends Error{}class BadRequestException extends Error{}class ConflictException extends Error{}class NotFoundException extends Error{}
const deco=()=>()=>{},nest={ServiceUnavailableException,BadRequestException,ConflictException,NotFoundException,Controller:deco,Get:deco,Post:deco,Body:deco,Param:deco,Req:deco,UseGuards:deco,Injectable:deco,Module:deco};
const manifest=load('contexts/platform/domain/schema-manifest.ts'),rls=load('contexts/tenant-isolation/domain/rls-policy-contract.ts');
const pathGate='contexts/billing/infrastructure/billing-activation.ts';
function gate(m=manifest,p=rls){return load(pathGate,{'@nestjs/common':nest,'../../platform/domain/schema-manifest':m,'../../tenant-isolation/domain/rls-policy-contract':p});}
const {requireBillingActivation}=gate();
test('reviewed commercial migration still requires a real matching ledger entry',async()=>{
 let calls=0;await assert.rejects(requireBillingActivation({query:async()=>{calls++;return {rows:[]};}}),ServiceUnavailableException);assert.equal(calls,1);
 const entry=manifest.REQUIRED_SCHEMA_MIGRATIONS.find(m=>m.filename==='030_commercial_billing.sql');assert(entry);
 await requireBillingActivation({query:async()=>({rows:[{sha256:entry.sha256}]})});
});
test('future activation needs reviewed migration, all tenant policies and exact ledger checksum',async()=>{
 const m={REQUIRED_SCHEMA_MIGRATIONS:[{filename:'030_commercial_billing.sql',sha256:'expected'}]},p={PROTECTED_TABLES:['billing_invoices','billing_journal','billing_settlements','billing_subscriptions']};
 await assert.rejects(gate(m,{PROTECTED_TABLES:[]}).requireBillingActivation({query:async()=>{throw Error('MUST_NOT_QUERY');}}),ServiceUnavailableException);
 const g=gate(m,p);
 await assert.rejects(g.requireBillingActivation({query:async()=>({rows:[{sha256:'wrong'}]})}),ServiceUnavailableException);
 await g.requireBillingActivation({query:async(sql,args)=>{assert.match(sql,/assettrust_schema_migrations/);assert.equal(args[0],'030_commercial_billing.sql');return {rows:[{sha256:'expected'}]};}});
});
const policy=load('contexts/billing/domain/commercial-policy.ts');
let transactions=0;
const {BillingAdminService}=load('contexts/billing/infrastructure/billing.module.ts',{
 '@nestjs/common':nest,'../../../database':{},'../../../audit':{AuditModule:class{}},'../../../auth':{AuthGuard:class{},AuthModule:class{}},
 '../../../common':{uid:()=> '22345678-1234-4234-8234-123456789abc',isUuid:x=>x},
 './pg-billing.repository':{PgBillingRepository:class{constructor(){transactions++;}}},'./billing-activation':{requireBillingActivation},'../domain/commercial-policy':policy
});
const actor={id:'12345678-1234-4234-8234-123456789abc',organizationId:'32345678-1234-4234-8234-123456789abc'};
test('unmigrated API rejects valid invoice operations before opening repository',async()=>{
 const svc=new BillingAdminService({query:async()=>({rows:[]})},{});transactions=0;
 for(const call of [()=>svc.catalog(actor,'sid'),()=>svc.list(actor,'sid'),()=>svc.get(actor,'sid','id'),()=>svc.create(actor,'sid',{expectedCatalogVersion:1,items:[{code:'review',quantity:1}]}),()=>svc.transition(actor,'sid','id',{expectedRevision:0,action:'ISSUE'})])await assert.rejects(call(),ServiceUnavailableException);
 assert.equal(transactions,0);
});
test('financial API rejects client price, tenant and payment claims',async()=>{
 const svc=new BillingAdminService({},{});
 for(const body of [{expectedCatalogVersion:1,items:[{code:'review',quantity:1,unitUgx:1}]},{expectedCatalogVersion:1,items:[{code:'review',quantity:1}],organizationId:'other'}])await assert.rejects(svc.create(actor,'sid',body),BadRequestException);
 for(const action of ['PAID','SETTLE','REFUND'])await assert.rejects(svc.transition(actor,'sid','id',{expectedRevision:0,action}),BadRequestException);
});
test('catalog publication is in the same approval transaction after effective value and decision, before audit',()=>{
 const s=read('contexts/admin-control/infrastructure/admin-control.module.ts');
 const part=s.slice(s.indexOf('async decide('),s.indexOf("@Controller('admin-control')"));
 assert(part.indexOf('await requireBillingActivation(tx)')<part.indexOf('await this.apply(tx'));
 assert(part.indexOf('UPDATE admin_configuration_changes SET status')<part.indexOf('await publishApprovedCatalog(tx,id)'));
 assert(part.indexOf('await publishApprovedCatalog(tx,id)')<part.indexOf('await this.audit.write(tx,u'));
 assert(read('main.ts').includes('AnchorOperationsModule,BillingModule,NotificationsModule'));
});
