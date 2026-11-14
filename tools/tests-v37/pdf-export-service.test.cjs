'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class NotFoundException extends Error{}class ConflictException extends Error{}class ForbiddenException extends Error{}class BadRequestException extends Error{}class ServiceUnavailableException extends Error{}
const deco=()=>()=>{},nest={NotFoundException,ConflictException,ForbiddenException,BadRequestException,ServiceUnavailableException,Body:deco,Controller:deco,Get:deco,Header:deco,Post:deco,Param:deco,Req:deco,UseGuards:deco,Injectable:deco,Module:deco};
function load(rel,imports={},overrides={}){
 const file=path.join(root,rel),mod={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>id==='node:crypto'?crypto:imports[id],Date,JSON,Number,Map,Set,Object,Error,Buffer,console,process:overrides.process||process},{filename:file,timeout:5000});return mod.exports;
}
const policy=load('contexts/report-issuance/domain/report-policy.ts');
const att=load('contexts/report-issuance/domain/signed-attestation.ts',{'./report-policy':policy});
const pdf=load('contexts/report-issuance/domain/signed-pdf.ts',{'./report-policy':policy,'./signed-attestation':att});
const keys=crypto.generateKeyPairSync('ed25519');const secret=keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
const trusted={'v37-test-key':keys.publicKey.export({format:'der',type:'spki'}).toString('base64')};
const configuredProcess={env:{ASSETTRUST_REPORT_SIGNING_KEY_ID:'v37-test-key',ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64:secret}};
let authOk=true;
const svcType=load('contexts/report-issuance/infrastructure/report-issuance.module.ts',{
 '@nestjs/common':nest,'../../tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'../../../database':{},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},'../../../common':{uid:()=>crypto.randomUUID(),isUuid:id=>id},
 '../../content-publishing/infrastructure/published-content.module':{PublishedContentModule:class{}},
 '../../identity/infrastructure/current-admin-step-up':{assertCurrentAdminStepUp:async()=>{if(!authOk)throw new ForbiddenException('Current admin step-up required')}},
 '../domain/report-policy':policy,'../domain/signed-attestation':att,'../domain/signed-pdf':pdf
 },{process:configuredProcess});
const REPORT='a1234567-1234-4234-8234-1234567890ab';
const A={id:'admin-a',organizationId:'tenant-a',role:'ORG_ADMIN'},X={id:'admin-x',organizationId:'tenant-x',role:'ORG_ADMIN'};
function fixture(){
 const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:policy.REPORT_LEGAL_STATUS,legalNotice:policy.REPORT_NOTICE,organizationId:'tenant-a',organizationName:'Demo Organization',caseCode:'CASE-1',assetCode:'ASSET-1',summary:'Independent review of test evidence, not proof of ownership',evidence:[]};
 const digest=crypto.createHash('sha256').update(policy.canonicalSnapshot(snapshot)).digest('hex');
 const row={id:REPORT,snapshot,snapshot_sha256:digest,issued_at:'2026-11-11T00:00:00.000Z',withdrawn:false,withdrawal_pending:false,superseded:false,under_review:false};
 const events=[],queries=[];
 const db={transaction:async fn=>fn({query:async (sql,args)=>{queries.push({sql,args});if(!sql.includes('FROM issued_verification_reports r WHERE r.id=$1 AND r.organization_id=$2'))throw Error('Unexpected SQL');return {rows:args[1]==='tenant-a'?[row]:[]}}})};
 const audit={write:async (_tx,_actor,kind,_type,id,data)=>{events.push({kind,id,data})}};
 const published={};const svc=new svcType.ReportIssuanceService(db,audit,published);return {svc,row,events,queries};
}
test('live service export signs matching PDF bytes and audits tenant-scoped current-status snapshot',async()=>{
 const {svc,events,queries,row}=fixture();const out=await svc.pdfExport(A,'stepup',REPORT);
 assert.equal(out.schema,'ASSETTRUST_PDF_DOWNLOAD_V1');assert.equal(out.reportId,REPORT);
 const result=pdf.verifyPdfReceipt(Buffer.from(out.pdfBase64,'base64'),out.receipt,trusted);
 assert.equal(result.statusAtExport,'ISSUED');assert.equal(result.pdfSha256,events[0].data.pdfSha256);
 assert.equal(events.length,1);assert.equal(events[0].kind,'REPORT_PDF_EXPORTED');assert.equal(events[0].data.snapshotSha256,row.snapshot_sha256);
 assert(queries[0].sql.includes('r.organization_id=$2'));assert.deepEqual(Array.from(queries[0].args),[REPORT,'tenant-a']);
});
test('cross-tenant requests, failed MFA, altered saved evidence, missing signer block export and audit',async()=>{
 const {svc,row,events}=fixture();
 await assert.rejects(()=>svc.pdfExport(X,'stepup',REPORT),NotFoundException);assert.equal(events.length,0);
 authOk=false;await assert.rejects(()=>svc.pdfExport(A,'stepup',REPORT),ForbiddenException);authOk=true;
 row.snapshot.summary='tampered';await assert.rejects(()=>svc.pdfExport(A,'stepup',REPORT),ConflictException);assert.equal(events.length,0);
 row.snapshot.summary='Independent review of test evidence, not proof of ownership';
 const prior=configuredProcess.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;delete configuredProcess.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;
 try{await assert.rejects(()=>svc.pdfExport(A,'stepup',REPORT),ServiceUnavailableException)}finally{configuredProcess.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64=prior;}
 assert.equal(events.length,0);
});
test('withdrawn, superseded, pending withdrawal and dispute states remain visible in authenticated PDF receipt',async()=>{
 for(const [field,status] of [['withdrawn','WITHDRAWN'],['superseded','SUPERSEDED'],['withdrawal_pending','UNDER_REVIEW'],['under_review','UNDER_REVIEW']]){
  const {svc,row}=fixture();row[field]=true;
  const out=await svc.pdfExport(A,'stepup',REPORT);
  assert.equal(pdf.verifyPdfReceipt(Buffer.from(out.pdfBase64,'base64'),out.receipt,trusted).statusAtExport,status);
 }
});
