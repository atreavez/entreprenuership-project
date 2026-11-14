'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');const root=path.resolve(__dirname,'../../apps/api/src');
class BadRequestException extends Error{}class ConflictException extends Error{}class ForbiddenException extends Error{}class NotFoundException extends Error{}class ServiceUnavailableException extends Error{}
const decorator=()=>()=>{},common={BadRequestException,ConflictException,ForbiddenException,NotFoundException,ServiceUnavailableException,Controller:decorator,Get:decorator,Post:decorator,Param:decorator,Body:decorator,Req:decorator,Header:decorator,UseGuards:decorator,Injectable:decorator,Module:decorator};
function load(rel,imports={}){const file=path.join(root,rel),m={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(js,{module:m,exports:m.exports,require:id=>id==='node:crypto'?crypto:imports[id],Buffer,Date,JSON,Number,Object,Error,process,console},{filename:file,timeout:5000});return m.exports;}
const policy=load('contexts/report-sharing/domain/share-policy.ts');
const reportId='a1234567-1234-4234-8234-1234567890ab';
const input={reportId,recipientLabel:'Transaction team',reason:'Review the documented due diligence report for this transaction',expiresHours:24,maxDownloads:2};
const actor=(id,organizationId='org-one')=>({id,organizationId,role:'ORG_ADMIN'});
let fresh=true;
process.env.ASSETTRUST_REPORT_SIGNING_KEY_ID='test-signing-key';
process.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64='test-only-placeholder';
const {ReportSharingService}=load('contexts/report-sharing/infrastructure/report-sharing.module.ts',{
 '@nestjs/common':common,'@nestjs/throttler':{Throttle:decorator},'../../../database':{},'../../tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},
 '../../../common':{uid:crypto.randomUUID,isUuid:s=>{if(typeof s!=='string'||!/^[0-9a-f-]{36}$/.test(s))throw Error('UUID required');return s}},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminStepUp:async(_tx,a)=>{if(!fresh||a.role!=='ORG_ADMIN')throw new ForbiddenException('Admin MFA required')}},
 '../../report-issuance/domain/report-policy':{canonicalSnapshot:JSON.stringify},
 '../../report-issuance/domain/signed-attestation':{makeBundlePayload:args=>({...args,exportedAt:'2026-11-11T00:00:00Z',verificationPath:'/#verify/report/'+args.reportId})},
 '../../report-issuance/domain/signed-pdf':{renderPrivateReportPdf:()=>Buffer.from('%PDF-1.4\nmock private pdf data\n'),signPdfReceipt:(_p,pdf,keyId)=>({schema:'TEST',keyId,payload:{pdfSha256:crypto.createHash('sha256').update(pdf).digest('hex')}})},
 '../../report-issuance/domain/report-layout-policy':{},'../domain/share-policy':policy,'../domain/attempt-policy':load('contexts/report-sharing/domain/attempt-policy.ts')
});
function fixture(){const shares=[],redemptions=[],audit=[],queries=[],counters=new Map();let reportState='ISSUED',proposerActive=true,integrity=true;
 const snapshot={evidence:[],legalStatus:'PRIVATE_NON_OFFICIAL_EVIDENCE_REPORT'};
 const report={id:reportId,organization_id:'org-one',snapshot,snapshot_sha256:crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),issued_at:'2026-11-10T00:00:00Z',case_status:'CLOSED'};
 const tx={query:async(sql,params=[])=>{
  queries.push({sql,params});
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('JOIN verification_cases c ON')){if(params[1]!=='org-one')return {rows:[]};return {rows:[{...report,case_id:'case-one',case_status:reportState==='OPEN'?'OPEN':'CLOSED',snapshot_sha256:integrity?report.snapshot_sha256:'0'.repeat(64)}]};}
  if(sql.includes('AS withdrawal_pending')&&sql.includes('FROM issued_report_withdrawals'))return {rows:[{withdrawn:reportState==='WITHDRAWN',withdrawal_pending:reportState==='UNDER_REVIEW',superseded:reportState==='SUPERSEDED',disputed:false}]};
  if(sql.includes('INSERT INTO report_recipient_shares')){shares.push({id:params[0],organization_id:params[1],report_id:params[2],recipient_label:params[3],reason:params[4],token_sha256:params[5],code_sha256:params[6],expires_hours:params[7],max_downloads:params[8],proposed_by:params[9],status:'PENDING',download_count:0,expires_at:null});return {rows:[]};}
  if(sql.includes('SELECT report_id FROM report_recipient_shares'))return {rows:shares.filter(s=>s.id===params[0]&&s.organization_id===params[1]).map(s=>({report_id:s.report_id}))};
  if(sql.includes('FROM report_recipient_shares WHERE id=$1 AND organization_id=$2 FOR UPDATE')||sql.includes('FROM report_recipient_shares WHERE id=$1 AND organization_id=$2 FOR UPDATE'))return {rows:shares.filter(s=>s.id===params[0]&&s.organization_id===params[1])};
  if(sql.includes('FROM report_recipient_shares WHERE id=$1 FOR UPDATE'))return {rows:shares.filter(s=>s.id===params[0])};
  if(sql.includes('FROM report_share_access_windows WHERE share_id=$1'))return {rows:counters.has(params[0])?[{...counters.get(params[0]),checked_at:new Date()}]:[]};
  if(sql==='SELECT now() AS checked_at')return {rows:[{checked_at:new Date()}]};
  if(sql.includes('INSERT INTO report_share_access_windows')){const prev=counters.get(params[0]);const old=prev&&Date.now()-new Date(prev.window_started_at).getTime()<15*60000;
    counters.set(params[0],{window_started_at:old?prev.window_started_at:new Date(),failed_count:old?Math.min(10,prev.failed_count+1):1,last_failed_at:new Date()});return {rows:[]};}
  if(sql.includes('FROM report_share_access_windows w JOIN report_recipient_shares'))return {rows:[...counters].filter(([id])=>shares.some(s=>s.id===id&&s.organization_id===params[0])).map(([share_id,row])=>({share_id,...row}))};
  if(sql.includes('SELECT id FROM users'))return {rows:proposerActive?[{id:params[0]}]:[]};
  if(sql.includes('UPDATE report_recipient_shares SET status=$3')){const s=shares.find(s=>s.id===params[0]);s.status=params[2];s.reviewed_by=params[3];s.expires_at=s.status==='ACTIVE'?new Date(Date.now()+s.expires_hours*3600000):null;return {rows:[]};}
  if(sql.includes('UPDATE report_recipient_shares SET status=\'REVOKED\'')){const s=shares.find(s=>s.id===params[0]);s.status='REVOKED';return {rows:[]};}
  if(sql.includes('INSERT INTO report_share_redemptions')){redemptions.push({id:params[0],org:params[1],shareId:params[2],pdfSha:params[4]});return {rows:[]};}
  if(sql.includes('UPDATE report_recipient_shares SET download_count')){shares.find(s=>s.id===params[0]).download_count++;return {rows:[]};}
  if(sql.includes('FROM report_pdf_layout_active'))return {rows:[]};
  if(sql.includes('SELECT id,report_id,recipient_label,reason,expires_hours'))return {rows:shares.filter(s=>s.organization_id===params[0])};
  if(sql.includes('FROM report_share_redemptions WHERE organization_id'))return {rows:redemptions.filter(e=>e.org===params[0])};
  throw Error('Unhandled mock SQL: '+sql);
 }};
 const db={transaction:fn=>fn(tx)};const auditService={write:async(_tx,a,action,_type,id)=>{audit.push({org:a.organizationId,action,id})}};
 return {svc:new ReportSharingService(db,auditService),shares,redemptions,audit,queries,setState:v=>{reportState=v},setProposerActive:v=>{proposerActive=v},setIntegrity:v=>{integrity=v}};
}
const secrets=async(f,a=actor('admin-A'))=>{const p=await f.svc.create(a,'session',input);return p};
test('independent MFA approval, bounded redemption count, denied replay and append-only events',async()=>{
 const f=fixture(),a=actor('admin-A'),b=actor('admin-B');const p=await secrets(f,a);
 assert.equal(p.status,'PENDING');assert.equal(f.shares[0].token_sha256.includes(p.accessToken),false);
 await assert.rejects(()=>f.svc.redeem({shareId:p.id,accessToken:p.accessToken,accessCode:p.accessCode}),NotFoundException);
 await assert.rejects(()=>f.svc.decide(a,'session',p.id,{decision:'APPROVE'}),ForbiddenException);
 assert.equal((await f.svc.decide(b,'session',p.id,{decision:'APPROVE'})).status,'ACTIVE');
 const data={shareId:p.id,accessToken:p.accessToken,accessCode:p.accessCode};
 for(let i=0;i<2;i++)assert.equal((await f.svc.redeem(data)).schema,'ASSETTRUST_RECIPIENT_PDF_V1');
 await assert.rejects(()=>f.svc.redeem(data),NotFoundException);
 assert.equal(f.redemptions.length,2);assert.equal(f.shares[0].download_count,2);
 assert(f.audit.some(x=>x.action==='REPORT_SHARE_APPROVED'));
});
test('invalid credentials, cross organization admin and expired and revoked access fail closed',async()=>{
 const f=fixture(),a=actor('admin-A'),b=actor('admin-B'),p=await secrets(f,a);
 await assert.rejects(()=>f.svc.decide(actor('other','org-two'),'session',p.id,{decision:'APPROVE'}),NotFoundException);
 await f.svc.decide(b,'session',p.id,{decision:'APPROVE'});
 await assert.rejects(()=>f.svc.redeem({shareId:p.id,accessToken:p.accessCode,accessCode:p.accessToken}),NotFoundException);
 f.shares[0].expires_at='2001-01-01T00:00:00Z';await assert.rejects(()=>f.svc.redeem({shareId:p.id,accessToken:p.accessToken,accessCode:p.accessCode}),NotFoundException);
 f.shares[0].expires_at=new Date(Date.now()+3600000);
 assert.equal((await f.svc.revoke(a,'session',p.id,{reason:'Organization review ended; remove access immediately'})).status,'REVOKED');
 await assert.rejects(()=>f.svc.redeem({shareId:p.id,accessToken:p.accessToken,accessCode:p.accessCode}),NotFoundException);
 assert.equal(f.redemptions.length,0);
});
test('withdrawal, dispute, supersession, or snapshot tampering stops recipient access and new proposals',async()=>{
 for(const state of ['WITHDRAWN','SUPERSEDED','UNDER_REVIEW','OPEN']){
  const f=fixture(),p=await secrets(f);await f.svc.decide(actor('admin-B'),'session',p.id,{decision:'APPROVE'});f.setState(state);
  await assert.rejects(()=>f.svc.redeem({shareId:p.id,accessToken:p.accessToken,accessCode:p.accessCode}),NotFoundException);
  await assert.rejects(()=>secrets(f),ConflictException);
 }
 const f=fixture(),p=await secrets(f);await f.svc.decide(actor('admin-B'),'session',p.id,{decision:'APPROVE'});f.setIntegrity(false);
 await assert.rejects(()=>f.svc.redeem({shareId:p.id,accessToken:p.accessToken,accessCode:p.accessCode}),NotFoundException);
});
test('fresh MFA, active proposer, rejection, and tenant isolation are enforced',async()=>{
 const f=fixture(),p=await secrets(f);
 fresh=false;await assert.rejects(()=>f.svc.create(actor('admin-A'),'session',input),ForbiddenException);fresh=true;
 f.setProposerActive(false);await assert.rejects(()=>f.svc.decide(actor('admin-B'),'session',p.id,{decision:'APPROVE'}),ForbiddenException);
 f.setProposerActive(true);assert.equal((await f.svc.decide(actor('admin-B'),'session',p.id,{decision:'REJECT'})).status,'REJECTED');
 await assert.rejects(()=>f.svc.decide(actor('admin-B'),'session',p.id,{decision:'APPROVE'}),ConflictException);
 assert.equal((await f.svc.list(actor('other','org-two'),'session')).shares.length,0);
 assert.equal(f.redemptions.length,0);
});
