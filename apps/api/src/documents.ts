import {setTenantScope} from './contexts/tenant-isolation/application/tenant-scope';
import { Controller, Get, Post, Param, Body, Req, Res, UseGuards, UseInterceptors, UploadedFile, Injectable, Module, NotFoundException, BadRequestException, ServiceUnavailableException, Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Database } from './database';
import { AuditModule,AuditService } from './audit';
import { AuthGuard,AuthModule } from './auth';
import { uid,hash,UserAuth,assertRole,isUuid,text } from './common';
import {AccessModule,AccessService} from './access';
import { assertAllowedDocument,DocumentPolicyError,requireEncryptedFormat } from './contexts/document-vault/domain/document-policy';
import {ENCRYPTED_BLOB_STORE,type EncryptedBlobStore} from './contexts/document-vault/application/blob-store.port';
import {EncryptedLocalBlobStore} from './contexts/document-vault/infrastructure/encrypted-local-blob.store';
import type { Response } from 'express';
import {DOCUMENT_MALWARE_SCANNER,DocumentMalwareScanner,DocumentScanError} from './contexts/document-vault/application/malware-scanner.port';
import {ClamAvInstreamScanner} from './contexts/document-vault/infrastructure/clamav-instream-scanner';
import {requireCurrentAssetContribution,requireCurrentCaseContribution,requireCurrentAssetRead,requireCurrentCaseRead} from './contexts/access/infrastructure/transactional-access';
@Injectable()
export class DocumentsService{
 constructor(private db:Database,private audit:AuditService,private access:AccessService,@Inject(ENCRYPTED_BLOB_STORE) private blobs:EncryptedBlobStore,@Inject(DOCUMENT_MALWARE_SCANNER) private malware:DocumentMalwareScanner){}
 /** A previously issued ORG_ADMIN token must not bypass current membership.
  * One tenant-scoped SQL statement joins the active actor and uses the role in
  * PostgreSQL, not a stale JWT claim. No access to suspended/deleted users.
  */
 async list(u:UserAuth){
  const {rows}=await this.db.tenantQuery(u.organizationId,`SELECT d.id,d.asset_id,d.case_id,d.display_name,d.mime_type,d.file_size,d.sha256,d.review_status,d.storage_format,d.encryption_key_id,d.created_at
   FROM documents d JOIN users actor ON actor.id=$2 AND actor.organization_id=d.organization_id AND actor.suspended_at IS NULL
   WHERE d.organization_id=$1 AND (actor.role='ORG_ADMIN' OR (
    (d.case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM verification_cases c WHERE c.id=d.case_id AND c.organization_id=d.organization_id
      AND (c.created_by=actor.id OR c.assigned_to=actor.id)))
    OR (d.case_id IS NULL AND EXISTS (
      SELECT 1 FROM assets a WHERE a.id=d.asset_id AND a.organization_id=d.organization_id
      AND (a.created_by=actor.id OR EXISTS (
       SELECT 1 FROM verification_cases c2 WHERE c2.asset_id=a.id AND c2.organization_id=a.organization_id
        AND (c2.created_by=actor.id OR c2.assigned_to=actor.id)) OR EXISTS (
       SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=a.organization_id
        AND g.grantee_id=actor.id AND g.expires_at>now()))))
    )) ORDER BY d.created_at DESC LIMIT 200`,[u.organizationId,u.id]);return rows;
 }

 async upload(u:UserAuth,body:any,file:Express.Multer.File){
  if(!file)throw new BadRequestException('File required');
  assertRole(u,['ORG_ADMIN','CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER']);
  const name=text(file.originalname,'filename',160);
  const b=file.buffer;
  try{assertAllowedDocument(b,file.mimetype,file.size);}catch(e){if(e instanceof DocumentPolicyError)throw new BadRequestException(e.message);throw e;}
  const assetId=body?.assetId?isUuid(body.assetId):null,caseId=body?.caseId?isUuid(body.caseId):null;
  if(!assetId&&!caseId)throw new BadRequestException('assetId or caseId is required');
  if(assetId)await this.access.asset(u,assetId,true);
  if(caseId)await this.access.case(u,caseId,true);
  if(assetId){const a=await this.db.tenantQuery(u.organizationId,'SELECT id FROM assets WHERE id=$1 AND organization_id=$2',[assetId,u.organizationId]);if(!a.rows.length)throw new NotFoundException('Asset not found');}
  if(caseId){const c=await this.db.tenantQuery(u.organizationId,'SELECT id,asset_id FROM verification_cases WHERE id=$1 AND organization_id=$2',[caseId,u.organizationId]);if(!c.rows.length)throw new NotFoundException('Case not found');if(assetId&&c.rows[0].asset_id!==assetId)throw new BadRequestException('Case and asset mismatch');}
  // Scan exactly the in-memory bytes that will later be encrypted and stored.
  // A missing daemon, timeout, malformed result or positive detection all fail closed.
  try { await this.malware.scan(b); }
  catch(e){
   if(e instanceof DocumentScanError && e.reason==='INFECTED')throw new BadRequestException('Document rejected by security screening');
   throw new ServiceUnavailableException('Document security screening unavailable');
  }
  const id=uid(),sha=hash(b),identity={id,organizationId:u.organizationId,sha256:sha};
  // Always encrypt before recording metadata; never write plaintext to the blob directory.
  const receipt=await this.blobs.put(identity,b);
  try {await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   // Revocation after the initial HTTP access check must win before metadata is committed.
   // Permission rows are locked for the lifetime of this DB transaction.
   if(assetId)await requireCurrentAssetContribution(tx,u,assetId);
   if(caseId){const c=await requireCurrentCaseContribution(tx,u,caseId);
    if(assetId && c.assetId!==assetId)throw new BadRequestException('Case and asset mismatch');}
   await tx.query(`INSERT INTO documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format,encryption_key_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,u.organizationId,assetId,caseId,name,receipt.storedName,file.mimetype,b.length,sha,u.id,receipt.storageFormat,receipt.encryptionKeyId]);
   await this.audit.write(tx,u,'DOCUMENT_UPLOADED','document',id,{sha256:sha,fileSize:b.length,storageFormat:receipt.storageFormat,keyId:receipt.encryptionKeyId});
  });}catch(err){await this.blobs.delete(receipt.storedName);throw err;}
  return {id,displayName:name,sha256:sha,reviewStatus:'SUBMITTED',fileSize:b.length,storageFormat:receipt.storageFormat};
 }
 /** Read encrypted content under the SAME transaction and permission locks.
  * A concurrent revocation, role downgrade, case reassignment or suspension
  * either wins before authorization (then download is denied), or waits until
  * this bounded encrypted-file read finishes. The blob digest is verified
  * before the locks are released. This makes no claim about bytes delivered
  * to clients after the HTTP response has begun.
  */
 async getBytes(u:UserAuth,id:string){
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   const {rows}=await tx.query('SELECT * FROM documents WHERE id=$1 AND organization_id=$2 FOR SHARE',[isUuid(id),u.organizationId]);
   if(!rows[0])throw new NotFoundException('Document not found');
   const r=rows[0];
   if(!r.asset_id&&!r.case_id)throw new NotFoundException('Document has no authorized resource');
   if(r.asset_id)await requireCurrentAssetRead(tx,u,r.asset_id);
   if(r.case_id)await requireCurrentCaseRead(tx,u,r.case_id);
   try{requireEncryptedFormat(r.storage_format);}catch{throw new BadRequestException('Document requires secure-storage migration');}
   try{
    const content=await this.blobs.get({id:r.id,organizationId:r.organization_id,sha256:r.sha256},r.stored_name);
    if(hash(content)!==r.sha256)throw new Error('Document digest mismatch');
    return {content,mime:r.mime_type,name:r.display_name};
   }catch{
    throw new BadRequestException('Document integrity or secure storage check failed');
   }
  });
 }
}
@Controller('documents')@UseGuards(AuthGuard)
export class DocumentsController{
 constructor(private svc:DocumentsService){}
 @Get()list(@Req()r:any){return this.svc.list(r.user);}
 @Post('upload')@UseInterceptors(FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:5*1024*1024,files:1}}))
 upload(@Req()r:any,@Body()body:any,@UploadedFile()file:Express.Multer.File){return this.svc.upload(r.user,body,file);}
 @Get(':id/file')async file(@Req()r:any,@Param('id')id:string,@Res()res:Response){const {content,mime,name}=await this.svc.getBytes(r.user,id);
  res.setHeader('Content-Type',mime);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Disposition',`attachment; filename="${name.replace(/[^\w .-]/g,'_')}"`);res.send(content);
 }
}
@Module({imports:[AuthModule,AuditModule,AccessModule],providers:[DocumentsService,{provide:ENCRYPTED_BLOB_STORE,useClass:EncryptedLocalBlobStore},{provide:DOCUMENT_MALWARE_SCANNER,useClass:ClamAvInstreamScanner}],controllers:[DocumentsController]})export class DocumentsModule{}
