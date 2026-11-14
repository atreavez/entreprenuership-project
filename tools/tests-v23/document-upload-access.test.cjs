'use strict';
/** Execute real DocumentsService.upload with an in-memory transaction substitute.
 * Does not claim real PostgreSQL or filesystem verification.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID,createHash}=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
const noop=()=>()=>{};
class ForbiddenException extends Error{}
class NotFoundException extends Error{}
class BadRequestException extends Error{}
class ServiceUnavailableException extends Error{}
const commonNest={Controller:noop,Get:noop,Post:noop,Param:noop,Body:noop,Req:noop,Res:noop,UseGuards:noop,UseInterceptors:noop,UploadedFile:noop,Injectable:noop,Module:noop,Inject:noop,ForbiddenException,NotFoundException,BadRequestException,ServiceUnavailableException};
function compile(source,imports){
 const js=ts.transpileModule(fs.readFileSync(source,'utf8'),{fileName:source,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 const box={module:{exports:{}},exports:{},require:id=>{if(Object.prototype.hasOwnProperty.call(imports,id))return imports[id];throw Error('Unexpected dependency '+id)},console,Buffer,Date,process:{env:{}}};box.exports=box.module.exports;
 vm.runInNewContext(js,box,{filename:source,timeout:5000});return box.module.exports;
}
const accessAdapter=compile(path.join(root,'contexts/access/infrastructure/transactional-access.ts'),{'@nestjs/common':commonNest});
const {DocumentsService}=compile(path.join(root,'documents.ts'),{
 '@nestjs/common':commonNest,'@nestjs/platform-express':{FileInterceptor:noop},'multer':{memoryStorage:()=>({})},
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},'./database':{},'./audit':{AuditModule:class{}},'./auth':{AuthGuard:class{},AuthModule:class{}},
 './common':{uid:randomUUID,isUuid:v=>v,text:v=>String(v),assertRole:()=>{},hash:b=>createHash('sha256').update(b).digest('hex')},
 './access':{AccessModule:class{}},
 './contexts/document-vault/domain/document-policy':{assertAllowedDocument:()=>{},DocumentPolicyError:class extends Error{},requireEncryptedFormat:()=>{}},
 './contexts/document-vault/application/blob-store.port':{ENCRYPTED_BLOB_STORE:'encrypted'},
 './contexts/document-vault/application/malware-scanner.port':{DOCUMENT_MALWARE_SCANNER:'scanner',DocumentScanError:class extends Error{}},
 './contexts/document-vault/infrastructure/clamav-instream-scanner':{ClamAvInstreamScanner:class{}},
 './contexts/document-vault/infrastructure/encrypted-local-blob.store':{EncryptedLocalBlobStore:class{}},
 './contexts/access/infrastructure/transactional-access':accessAdapter
});
const actor={id:randomUUID(),organizationId:randomUUID(),role:'CLIENT'};
const assetId=randomUUID(),caseId=randomUUID(),blob={originalname:'report.pdf',mimetype:'application/pdf',size:12,buffer:Buffer.from('%PDF-1.7test')};
function fixture({grantAllowed=false,caseAuthorized=false}={}){
 let puts=0,deletes=0,inserts=0,audits=0;const sql=[];
 const query=async(query,params)=>{
  sql.push(query);
  if(query.startsWith('SELECT id FROM assets'))return {rows:[{id:assetId}]};
  if(query.startsWith('SELECT id,asset_id FROM verification_cases'))return {rows:[{id:caseId,asset_id:assetId}]};
  if(/FROM assets a\s+JOIN users actor/i.test(query))return {rows:[{id:assetId,asset_type:'LAND',created_by:'someone-else',role:'CLIENT'}]};
  if(/FROM verification_cases c\s+WHERE/i.test(query))return {rows:[]};
  if(/FROM resource_grants g\s+WHERE/i.test(query))return {rows:grantAllowed?[{id:'grant'}]:[]};
  if(/FROM verification_cases c JOIN users actor/i.test(query))return {rows:[{asset_id:assetId,created_by:caseAuthorized?actor.id:'another-user',assigned_to:'another-user',role:'CLIENT'}]};
  if(query.includes('INSERT INTO documents')){inserts++;return {rows:[],rowCount:1}};
  throw Error('Unexpected SQL: '+query);
 };
 const svc=new DocumentsService({query,tenantQuery:async (_org,sql,args)=>query(sql,args),transaction:async fn=>fn({query})},{write:async()=>{audits++}},{asset:async()=>{},case:async()=>{}},{put:async()=>{puts++;return {storedName:randomUUID()+'.blob',storageFormat:'AES_256_GCM_V1',encryptionKeyId:'test'}},delete:async()=>{deletes++}},{scan:async()=>{}});
 return {svc,sql,get puts(){return puts},get deletes(){return deletes},get inserts(){return inserts},get audits(){return audits}};
}
test('revoked asset contributor cannot commit uploaded metadata and encrypted orphan is removed',async()=>{
 const f=fixture();await assert.rejects(()=>f.svc.upload(actor,{assetId},blob),ForbiddenException);
 assert.equal(f.puts,1);assert.equal(f.deletes,1);assert.equal(f.inserts,0);assert.equal(f.audits,0);
});
test('currently authorized asset contributor can upload an encrypted document',async()=>{
 const f=fixture({grantAllowed:true});const r=await f.svc.upload(actor,{assetId},blob);
 assert.equal(r.storageFormat,'AES_256_GCM_V1');assert.equal(f.puts,1);assert.equal(f.deletes,0);assert.equal(f.inserts,1);assert.equal(f.audits,1);
});
test('loss of case participation blocks case-only upload and cleans up staged blob',async()=>{
 const f=fixture({caseAuthorized:false});await assert.rejects(()=>f.svc.upload(actor,{caseId},blob),ForbiddenException);
 assert.equal(f.puts,1);assert.equal(f.deletes,1);assert.equal(f.inserts,0);
});
test('active case creator can still attach a document to a confidential case',async()=>{
 const f=fixture({caseAuthorized:true});await f.svc.upload(actor,{caseId},blob);
 assert.equal(f.deletes,0);assert.equal(f.inserts,1);
});
