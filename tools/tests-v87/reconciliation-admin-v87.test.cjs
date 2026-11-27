'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
class ForbiddenException extends Error{}class NotFoundException extends Error{}class ConflictException extends Error{}class BadRequestException extends Error{}
const deco=()=>()=>{},nest={ForbiddenException,NotFoundException,ConflictException,BadRequestException,Controller:deco,Get:deco,Post:deco,Req:deco,Param:deco,Body:deco,UseGuards:deco,Injectable:deco,Module:deco};
const actor={id:'12345678-1234-4234-8234-123456789abc',organizationId:'22345678-1234-4234-8234-123456789abc'},id='32345678-1234-4234-8234-123456789abc';
function fixture({denied=false,found=true}={}){
 const events=[],tx={query:async(sql,args)=>{events.push({sql,args});if(sql.includes('SELECT id FROM'))return {rows:found?[{id}]:[]};return {rows:[]};}};
 const imports={'@nestjs/common':nest,'../../../database':{},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},'../../../common':{isUuid:x=>x},
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async(_tx,org)=>events.push({sql:'SCOPE',args:[org]})},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminSession:async()=>{events.push({sql:'SESSION'});if(denied)throw new ForbiddenException();},assertCurrentAdminStepUp:async()=>{events.push({sql:'MFA'});if(denied)throw new ForbiddenException();}},
 './pg-reconciliation-jobs':{requireReconciliationSchema:async()=>events.push({sql:'SCHEMA'}),hydrateReconciliationJob:x=>x,PgReconciliationJobs:class{async recover(...args){events.push({sql:'RECOVER',args});return {id,state:'QUEUED'};}}}};
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(read('apps/api/src/contexts/billing/infrastructure/reconciliation-admin.module.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});
 return {svc:new m.exports.ReconciliationAdminService({transaction:async fn=>fn(tx)},{}),events};
}
test('revoked administrators cannot read reconciliation records or request recovery',async()=>{
 for(const method of [s=>s.list(actor,'sid'),s=>s.history(actor,'sid',id),s=>s.recover(actor,'sid',id,{expectedRevision:1,reason:'Provider check requested'})]){
  const f=fixture({denied:true});await assert.rejects(method(f.svc),ForbiddenException);assert.equal(f.events.length,2);
 }
});
test('history only reads current tenant and hides missing job',async()=>{
 const f=fixture({found:false});await assert.rejects(f.svc.history(actor,'sid',id),NotFoundException);
 assert.deepEqual(Array.from(f.events.at(-1).args),[actor.organizationId,id]);assert(!f.events.some(e=>e.sql.includes('FROM public.billing_reconciliation_history')));
});
test('recovery validates revision and reason and does not accept financial claims',async()=>{
 const f=fixture();
 for(const b of [{expectedRevision:1,reason:'short'},{expectedRevision:-1,reason:'Provider check requested'},{expectedRevision:1,reason:'Provider check requested',paid:true}])await assert.rejects(f.svc.recover(actor,'sid',id,b),BadRequestException);
 assert.equal(f.events.length,0);
 const out=await f.svc.recover(actor,'sid',id,{expectedRevision:1,reason:'Provider check requested'});
 assert.equal(out.dispatchState,'NOT_CONNECTED');assert.equal(f.events[1].sql,'MFA');assert.equal(f.events[2].sql,'RECOVER');
});
test('runtime grants deny queue ingestion and lease changes; UI only recovers existing jobs',()=>{
 const grants=read('tools/provision-ci-runtime-role-v57.mjs'),db=read('apps/api/src/database.ts'),ui=read('apps/web/src/ReconciliationPanel.tsx');
 assert(grants.includes('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON TABLE public.billing_reconciliation_jobs'));
 assert(grants.includes('GRANT UPDATE(state,revision,attempts,next_run_at) ON TABLE public.billing_reconciliation_jobs'));
 assert(db.includes("'lease_token','lease_until'"));assert(ui.includes('expectedRevision:job.revision,reason:reason.trim()'));assert(ui.includes('Dispatch not connected.'));
});
