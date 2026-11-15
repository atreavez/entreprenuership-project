'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');const src=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}class NotFoundException extends Error{}class ConflictException extends Error{}class BadRequestException extends Error{}class ServiceUnavailableException extends Error{}
const decorate=()=>()=>{},nest={ForbiddenException,NotFoundException,ConflictException,BadRequestException,ServiceUnavailableException,Body:decorate,Controller:decorate,Get:decorate,Header:decorate,Post:decorate,Param:decorate,Req:decorate,UseGuards:decorate,Injectable:decorate,Module:decorate};
const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
const env={ASSETTRUST_REPORT_SIGNING_KEY_ID:'local-key-1',ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64:privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
function load(rel,imports={}){const file=path.join(src,rel),m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{module:m,exports:m.exports,require:id=>id==='node:crypto'?crypto:imports[id],Buffer,Date,JSON,Number,Map,Set,Object,Error,process:{env},console},{filename:file,timeout:5000});return m.exports;}
const policy=load('contexts/report-issuance/domain/report-policy.ts');
const signing=load('contexts/report-issuance/domain/signed-attestation.ts',{'./report-policy':policy});
const current=load('contexts/identity/infrastructure/current-admin-step-up.ts',{'@nestjs/common':nest});
const {ReportIssuanceService}=load('contexts/report-issuance/infrastructure/report-issuance.module.ts',{'@nestjs/common':nest,'../../tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'../../../database':{},'../../../auth':{AuthGuard:class{},AuthModule:class{}},'../../../audit':{AuditModule:class{}},'../../../common':{uid:()=>'',isUuid:x=>x},'../../content-publishing/infrastructure/published-content.module':{PublishedContentModule:class{}},'../../identity/infrastructure/current-admin-step-up':current,'../domain/report-policy':policy,'../domain/signed-attestation':signing});
const ID='a1234567-1234-4234-8234-1234567890ab',ORG='test-org';
const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:policy.REPORT_LEGAL_STATUS,legalNotice:policy.REPORT_NOTICE,caseId:'confidential-id',organizationId:ORG,summary:'Private evidence for approved case'};
function fixture(){const digest=crypto.createHash('sha256').update(policy.canonicalSnapshot(snapshot)).digest('hex');
 const state={org:ORG,auth:true,withdrawn:false,integrity:true,events:[],queries:[]};
 const db={transaction:fn=>fn({query}),query};
 async function query(sql,args=[]){state.queries.push({sql,args});
  if(sql.includes('JOIN auth_mfa_credentials'))return {rows:state.auth?[{id:args[0]}]:[]};
  if(sql.includes('FROM issued_verification_reports r WHERE r.id=$1 AND r.organization_id=$2 FOR SHARE OF r'))return {rows:args[1]===state.org&&args[0]===ID?[{id:ID,snapshot,issued_at:new Date('2026-11-11T00:00:00Z'),snapshot_sha256:state.integrity?digest:'a'.repeat(64),withdrawn:state.withdrawn,withdrawal_pending:false,superseded:false,under_review:false}]:[]};
  throw Error('Unexpected SQL '+sql);
 }
 const audit={write:async(_tx,_actor,action,_entity,id,metadata)=>state.events.push({action,id,metadata})};
 return {state,svc:new ReportIssuanceService(db,audit,{})};
}
const actor=(org=ORG)=>({id:'admin-1',organizationId:org,role:'ORG_ADMIN'});
test('signed export returns real verifiable evidence and audits key/status without logging confidential data',async()=>{
 const f=fixture();const bundle=await f.svc.signedExport(actor(),'active-session',ID);
 assert.equal(bundle.schema,'ASSETTRUST_SIGNED_EVIDENCE_BUNDLE_V1');
 assert.equal(signing.verifyBundle(bundle,{'local-key-1':publicKey.export({format:'der',type:'spki'}).toString('base64')}).ok,true);
 assert.equal(f.state.events.length,1);assert.equal(f.state.events[0].action,'REPORT_SIGNED_BUNDLE_EXPORTED');
 assert(!JSON.stringify(f.state.events).includes('confidential-id'));
 const d=f.svc.signingKey();assert.equal(d.spkiDerBase64,publicKey.export({format:'der',type:'spki'}).toString('base64'));
});
test('tenant boundary and current MFA are enforced before returning private evidence',async()=>{
 const f=fixture();await assert.rejects(()=>f.svc.signedExport(actor('other-tenant'),'active-session',ID),NotFoundException);
 f.state.auth=false;await assert.rejects(()=>f.svc.signedExport(actor(),'active-session',ID),ForbiddenException);assert.equal(f.state.events.length,0);
});
test('tampered source, unavailable key and withdrawn status never silently issue healthy evidence',async()=>{
 const f=fixture();f.state.integrity=false;await assert.rejects(()=>f.svc.signedExport(actor(),'active-session',ID),ConflictException);
 f.state.integrity=true;f.state.withdrawn=true;
 const bundle=await f.svc.signedExport(actor(),'active-session',ID);assert.equal(bundle.payload.statusAtExport,'WITHDRAWN');
 const secret=env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;delete env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;
 try{await assert.rejects(()=>f.svc.signedExport(actor(),'active-session',ID),ServiceUnavailableException);assert.throws(()=>f.svc.signingKey(),ServiceUnavailableException)}finally{env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64=secret}
});
