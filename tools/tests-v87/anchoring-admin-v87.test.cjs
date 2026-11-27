'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
function load(file,imports={}){
 const source=fs.readFileSync(path.join(root,file),'utf8'),mod={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}},{timeout:3000});
 return mod.exports;
}
const anchor=load('contexts/anchoring/domain/anchor-job-policy.ts');
const billing=load('contexts/billing/domain/commercial-policy.ts');
const config=load('contexts/admin-control/domain/configuration-policy.ts',{'../../anchoring/domain/anchor-job-policy':anchor,'../../billing/domain/commercial-policy':billing});
const settings={enabled:true,target:{providerId:'mock',networkId:'testnet',minConfirmations:6},retryBaseMs:1000,maxAttempts:3,pollMs:5000};
const actor={id:'12345678-1234-4234-8234-123456789abc',organizationId:'22345678-1234-4234-8234-123456789abc'};
const proof='a'.repeat(64);
const deco=()=>()=>{};
class BadRequestException extends Error{}class ConflictException extends Error{}class NotFoundException extends Error{}
function fixture({authorized=true,approved=true,enabled=true,head='b'.repeat(64),actualProof=proof,found=false,sessionActive=true}={}){
 const events=[];
 class Repo{async createOrGetInTransaction(tx,job){events.push(['create',tx,job]);return {job,created:true};}}
 const {AnchoringAdminService}=load('contexts/anchoring/infrastructure/anchoring.module.ts',{
 '@nestjs/common':{Body:deco,Controller:deco,Get:deco,Post:deco,Param:deco,Req:deco,UseGuards:deco,Injectable:deco,Module:deco,BadRequestException,ConflictException,NotFoundException},
 '../../../database':{},'../../../auth':{},'../../../audit':{},'../../../common':{isUuid:x=>x,uid:()=>actor.id},
 '../../../integrations':{readLocalAuditProof:async(tx,org)=>{events.push(['proof',tx,org]);return {proof:actualProof,head};}},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminStepUp:async(tx,u,sid)=>{events.push(['stepup',tx,u,sid]);if(!authorized||!sessionActive)throw Error('denied');},assertCurrentAdminSession:async(tx,u,sid)=>{events.push(['session',tx,u,sid]);if(!authorized||!sessionActive)throw Error('denied');}},
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async(tx,org)=>events.push(['scope',tx,org])},
 '../domain/anchor-job-policy':anchor,'./pg-anchor-job.repository':{PgAnchorJobRepository:Repo,hydrateAnchorJob:x=>x}
 });
 const tx={query:async(sql,args)=>{events.push(['query',sql,args]);
 if(sql.includes('FROM admin_configuration_values'))return {rows:approved?[{value:JSON.stringify({...settings,enabled}),version:2}]:[]};
 if(sql.includes('FROM public.anchor_jobs'))return {rows:found?[{id:actor.id}]:[]};
 return {rows:[]};}};
 const db={transaction:async fn=>fn(tx)},audit={write:async(...args)=>events.push(['audit',...args])};
 return {svc:new AnchoringAdminService(db,audit),events,tx};
}
test('anchoring policy is platform-only, strictly validated and independently approved',()=>{
 const text=JSON.stringify(settings);
 const result=config.prepareChange('platform',anchor.ANCHOR_SETTINGS_KEY,text);
 assert.equal(result.requiresApproval,true);assert.equal(anchor.parseAnchorSettingsText(result.value,7).version,7);
 assert.throws(()=>config.prepareChange('organization',anchor.ANCHOR_SETTINGS_KEY,text));
 for(const bad of [{...settings,version:4},{...settings,secret:'raw'},{...settings,target:{...settings.target,url:'https://bad.invalid'}}])
  assert.throws(()=>config.prepareChange('platform',anchor.ANCHOR_SETTINGS_KEY,JSON.stringify(bad)));
});
test('request derives commitment from current tenant head and atomically audits a stored job',async()=>{
 const f=fixture(),r=await f.svc.request(actor,'sid',{expectedProof:proof});
 assert.equal(r.created,true);assert.equal(r.dispatchState,'NOT_CONNECTED');assert.equal(r.job.settings.version,2);
 assert.equal(r.job.organizationId,actor.organizationId);assert.equal(r.job.commitment,proof);
 const create=f.events.find(e=>e[0]==='create'),audit=f.events.find(e=>e[0]==='audit');
 assert.equal(create[1],f.tx);assert.equal(audit[1],f.tx);
 assert(f.events.findIndex(e=>e[0]==='stepup')<f.events.findIndex(e=>e[0]==='proof'));
});
test('unauthorized, unapproved, disabled, empty and stale requests never create a job',async()=>{
 for(const opts of [{authorized:false},{approved:false},{enabled:false},{head:'GENESIS'},{actualProof:'c'.repeat(64)}]){
  const f=fixture(opts);await assert.rejects(f.svc.request(actor,'sid',{expectedProof:proof}));assert(!f.events.some(e=>e[0]==='create'));
 }
 const f=fixture();await assert.rejects(f.svc.request(actor,'sid',{expectedProof:proof,organizationId:'foreign'}));assert.equal(f.events.length,0);
});
test('replay returns existing same-tenant request without a second audit event',async()=>{
 const f=fixture({actualProof:'c'.repeat(64),found:true});
 assert.equal((await f.svc.request(actor,'sid',{expectedProof:proof})).created,false);
 assert(!f.events.some(e=>e[0]==='create'||e[0]==='audit'));
});
test('history of invisible job is rejected and read access requires current administrator',async()=>{
 const f=fixture();await assert.rejects(f.svc.history(actor,'sid',actor.id),/not found/i);
 const denied=fixture({authorized:false});await assert.rejects(denied.svc.list(actor,'sid'),/denied/);
});

test('revoked session blocks job and history reads before any protected data query',async()=>{
 for(const method of ['list','history']){
  const f=fixture({sessionActive:false,found:true});
  await assert.rejects(f.svc[method](actor,'sid',actor.id),/denied/);
  assert(!f.events.some(e=>e[0]==='query'));
  assert.equal(f.events[0][0],'scope');assert.equal(f.events[1][0],'session');assert.equal(f.events[1][1],f.tx);
 }
});
test('requests cannot use inherited or alternate body keys',async()=>{
 const f=fixture(),body=Object.create({expectedProof:proof});body.unrelated=true;
 await assert.rejects(f.svc.request(actor,'sid',body));assert.equal(f.events.length,0);
});
