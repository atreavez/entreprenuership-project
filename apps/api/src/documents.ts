import { Controller, Get, Post, Param, Body, Req, Res, UseGuards, UseInterceptors, UploadedFile, Injectable, Module, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
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
import { Response } from 'express';
@Injectable()
export class DocumentsService{
 constructor(private db:Database,private audit:AuditService,private access:AccessService,@Inject(ENCRYPTED_BLOB_STORE) private blobs:EncryptedBlobStore){}
 async list(u:UserAuth){const {rows}=await this.db.query(`SELECT d.id,d.asset_id,d.case_id,d.display_name,d.mime_type,d.file_size,d.sha256,d.review_status,d.storage_format,d.encryption_key_id,d.created_at
  FROM documents d
  WHERE d.organization_id=$1 AND ($2::bool OR (
    (d.case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM verification_cases c WHERE c.id=d.case_id AND c.organization_id=d.organization_id
      AND (c.created_by=$3 OR c.assigned_to=$3)))
    OR (d.case_id IS NULL AND EXISTS (
      SELECT 1 FROM assets a WHERE a.id=d.asset_id AND a.organization_id=d.organization_id
      AND (a.created_by=$3 OR EXISTS (
       SELECT 1 FROM verification_cases c2 WHERE c2.asset_id=a.id AND c2.organization_id=a.organization_id
        AND (c2.created_by=$3 OR c2.assigned_to=$3)) OR EXISTS (
       SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=a.organization_id
        AND g.grantee_id=$3 AND g.expires_at>now()))))
    )) ORDER BY d.created_at DESC LIMIT 200`,[u.organizationId,u.role==='ORG_ADMIN',u.id]);return rows;}
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
  if(assetId){const a=await this.db.query('SELECT id FROM assets WHERE id=$1 AND organization_id=$2',[assetId,u.organizationId]);if(!a.rows.length)throw new NotFoundException('Asset not found');}
  if(caseId){const c=await this.db.query('SELECT id,asset_id FROM verification_cases WHERE id=$1 AND organization_id=$2',[caseId,u.organizationId]);if(!c.rows.length)throw new NotFoundException('Case not found');if(assetId&&c.rows[0].asset_id!==assetId)throw new BadRequestException('Case and asset mismatch');}
  const id=uid(),sha=hash(b),identity={id,organizationId:u.organizationId,sha256:sha};
  // Always encrypt before recording metadata; never write plaintext to the blob directory.
  const receipt=await this.blobs.put(identity,b);
  try {await this.db.transaction(async tx=>{
   await tx.query(`INSERT INTO documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format,encryption_key_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,u.organizationId,assetId,caseId,name,receipt.storedName,file.mimetype,b.length,sha,u.id,receipt.storageFormat,receipt.encryptionKeyId]);
   await this.audit.write(tx,u,'DOCUMENT_UPLOADED','document',id,{sha256:sha,fileSize:b.length,storageFormat:receipt.storageFormat,keyId:receipt.encryptionKeyId});
  });}catch(err){await this.blobs.delete(receipt.storedName);throw err;}
  return {id,displayName:name,sha256:sha,reviewStatus:'SUBMITTED',fileSize:b.length,storageFormat:receipt.storageFormat};
 }
 async getBytes(u:UserAuth,id:string){
  const {rows}=await this.db.query('SELECT * FROM documents WHERE id=$1 AND organization_id=$2',[isUuid(id),u.organizationId]);
  if(!rows[0])throw new NotFoundException('Document not found');
  const r=rows[0];
  if(r.asset_id)await this.access.asset(u,r.asset_id);
  if(r.case_id)await this.access.case(u,r.case_id);
  // Fail closed until old plaintext documents are migrated by an offline operator.
  try{requireEncryptedFormat(r.storage_format);}catch{throw new BadRequestException('Document requires secure-storage migration');}
  try{
   const content=await this.blobs.get({id:r.id,organizationId:r.organization_id,sha256:r.sha256},r.stored_name);
   if(hash(content)!==r.sha256)throw new Error('Document digest mismatch');
   return {content,mime:r.mime_type,name:r.display_name};
  }catch(e){
   // No details about encryption keys or the storage path are revealed to API consumers.
   throw new BadRequestException('Document integrity or secure storage check failed');
  }
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
@Module({imports:[AuthModule,AuditModule,AccessModule],providers:[DocumentsService,{provide:ENCRYPTED_BLOB_STORE,useClass:EncryptedLocalBlobStore}],controllers:[DocumentsController]})export class DocumentsModule{}
