'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');const root=path.resolve(__dirname,'../../apps/api/src');
class NotFoundException extends Error{}class ConflictException extends Error{}class ForbiddenException extends Error{}class BadRequestException extends Error{}
const decorator=()=>()=>{},common={NotFoundException,ConflictException,ForbiddenException,BadRequestException,Controller:decorator,Get:decorator,Post:decorator,Param:decorator,Body:decorator,Req:decorator,Header:decorator,UseGuards:decorator,Injectable:decorator,Module:decorator};
function load(rel,imports={}){const file=path.join(root,rel),m={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(js,{module:m,exports:m.exports,require:id=>id==='node:crypto'?crypto:imports[id],Buffer,Date,JSON,Number,Object,Error,process,console},{filename:file,timeout:5000});return m.exports;}
const policy=load('contexts/report-issuance/domain/report-layout-policy.ts');
const actor=(id,organizationId='org-1')=>({id,organizationId,role:'ORG_ADMIN'});
let auth=true;
const {ReportLayoutService}=load('contexts/report-layout/infrastructure/report-layout.module.ts',{
 '@nestjs/common':common,'../../../database':{},'../../tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},
 '../../../common':{uid:()=>crypto.randomUUID(),isUuid:s=>{if(!/^[0-9a-f-]{36}$/.test(s))throw new BadRequestException('UUID required');return s}},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminStepUp:async()=>{if(!auth)throw new ForbiddenException('Fresh MFA required')}},
 '../../report-issuance/infrastructure/report-issuance.module':{ReportIssuanceService:class{},ReportIssuanceModule:class{}},
 '../../report-issuance/domain/report-layout-policy':policy
});
const safe={headerTitle:'LOCAL PRIVATE EVIDENCE REPORT',footerNote:'PRIVATE VERIFICATION - RECHECK CURRENT STATUS',accentHex:'#17402F'};
function fixture(){
 let active={},proposals=[],revisions=[],audit=[],exports=[],queries=[];
 const tx={query:async(sql,params=[])=>{queries.push({sql,params});
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('SELECT a.revision,r.layout FROM report_pdf_layout_active')){const current=active[params[0]];return {rows:current?[{revision:current.revision,layout:current.layout}]:[]}}
  if(sql.includes('SELECT id FROM report_pdf_layout_proposals'))return {rows:proposals.filter(x=>x.organization_id===params[0]&&x.status==='PENDING')};
  if(sql.includes('INSERT INTO report_pdf_layout_proposals')){proposals.push({id:params[0],organization_id:params[1],proposed_layout:JSON.parse(params[2]),expected_revision:params[3],reason:params[4],proposed_by:params[5],status:'PENDING'});return {rows:[]}}
  if(sql.includes('FROM report_pdf_layout_proposals')&&sql.includes('FOR UPDATE'))return {rows:proposals.filter(x=>x.id===params[0]&&x.organization_id===params[1])};
  if(sql.includes('FROM users WHERE id=$1'))return {rows:params[0]==='suspended'?[]:[{id:params[0]}]};
  if(sql.includes('INSERT INTO report_pdf_layout_revisions')){revisions.push({organization_id:params[0],revision:params[1],layout:JSON.parse(params[2]),proposal_id:params[3],approved_by:params[4]});return {rows:[]}}
  if(sql.includes('INSERT INTO report_pdf_layout_active')){const revision=revisions.find(x=>x.organization_id===params[0]&&x.revision===params[1]);active[params[0]]={revision:revision.revision,layout:revision.layout};return {rows:[]}}
  if(sql.includes('UPDATE report_pdf_layout_proposals')){const p=proposals.find(x=>x.id===params[0]&&x.organization_id===params[1]);p.status=params[2];p.decided_by=params[3];return {rows:[]}}
  if(sql.includes('SELECT id,proposed_layout AS layout'))return {rows:proposals.filter(x=>x.organization_id===params[0])};
  if(sql.includes('SELECT revision,layout,approved_by'))return {rows:revisions.filter(x=>x.organization_id===params[0])};
  throw Error('Unexpected SQL '+sql);
 }};
 const db={transaction:fn=>fn(tx)};const auditService={write:async(_tx,a,event,entity,id,data)=>{audit.push({a,event,entity,id,data})}};
 const issuance={pdfExport:async(...args)=>{exports.push(args);return {schema:'ASSETTRUST_PDF_DOWNLOAD_V1',reportId:args[2],layout:args[3]}}};
 return {svc:new ReportLayoutService(db,auditService,issuance),proposals,revisions,active,audit,exports,queries};
}
const input={layout:safe,reason:'Adopt approved business branding with all evidence safeguards',expectedRevision:0};
test('tenant-specific PDF layout requires independent approval, is versioned, audited and used for export',async()=>{
 const f=fixture(),a=actor('admin-one'),b=actor('admin-two');
 const p=await f.svc.propose(a,'session',input);assert.equal(p.status,'PENDING');
 await assert.rejects(()=>f.svc.decide(a,'session',p.id,{decision:'APPROVE'}),ForbiddenException);
 await assert.rejects(()=>f.svc.propose(a,'session',input),ConflictException);
 const r=await f.svc.decide(b,'session',p.id,{decision:'APPROVE'});assert.equal(r.revision,1);assert.equal(f.revisions.length,1);
 await assert.rejects(()=>f.svc.decide(b,'session',p.id,{decision:'REJECT'}),ConflictException);
 const list=await f.svc.list(a,'session');assert.equal(list.active.revision,1);assert.equal(list.revisions.length,1);
 const out=await f.svc.exportPdf(a,'session','a1234567-1234-4234-8234-1234567890ab');
 assert.equal(out.layout.headerTitle,safe.headerTitle);assert.equal(out.layout.revision,1);
 assert.equal(f.exports[0][0].organizationId,a.organizationId);
 assert.deepEqual(f.audit.map(x=>x.event),['REPORT_PDF_LAYOUT_PROPOSED','REPORT_PDF_LAYOUT_APPROVED']);
 assert(f.queries.some(q=>q.sql.includes('organization_id=$1')));
});
test('different organization cannot decide or view another organization proposal',async()=>{
 const f=fixture(),a=actor('admin-one'),b=actor('admin-two','org-2');
 const p=await f.svc.propose(a,'session',input);
 await assert.rejects(()=>f.svc.decide(b,'session',p.id,{decision:'APPROVE'}),NotFoundException);
 const list=await f.svc.list(b,'session');assert.equal(list.proposals.length,0);assert.equal(list.active.revision,0);
});
test('rejected layout preserves active revision and bad input cannot reach database write',async()=>{
 const f=fixture(),a=actor('admin-one'),b=actor('admin-two');
 for(const bad of [{...input,extra:'stray'},{...input,layout:{...safe,accentHex:'#ffffff'}},{...input,expectedRevision:'0'}])
  await assert.rejects(()=>f.svc.propose(a,'session',bad),BadRequestException);
 assert.equal(f.proposals.length,0);
 const p=await f.svc.propose(a,'session',input);
 const d=await f.svc.decide(b,'session',p.id,{decision:'REJECT'});assert.equal(d.revision,null);
 const x=await f.svc.exportPdf(a,'session','a1234567-1234-4234-8234-1234567890ab');assert.equal(x.layout,undefined);
});
test('fresh admin step-up and active proposers are mandatory, and stale revisions fail closed',async()=>{
 const f=fixture(),a=actor('admin-one'),b=actor('admin-two');
 auth=false;await assert.rejects(()=>f.svc.propose(a,'session',input),ForbiddenException);auth=true;
 const p=await f.svc.propose(a,'session',input);f.proposals[0].proposed_by='suspended';
 await assert.rejects(()=>f.svc.decide(b,'session',p.id,{decision:'APPROVE'}),ForbiddenException);
 f.proposals[0].proposed_by='admin-one';f.active['org-1']={revision:2,layout:safe};
 await assert.rejects(()=>f.svc.decide(b,'session',p.id,{decision:'APPROVE'}),ConflictException);
 assert.equal(f.revisions.length,0);
});
