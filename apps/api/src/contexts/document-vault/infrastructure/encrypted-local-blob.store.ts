import { Injectable } from '@nestjs/common';
import { mkdir,chmod,open,unlink,rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join,resolve } from 'node:path';
import type {EncryptedBlobStore,DocumentIdentity,BlobReceipt} from '../application/blob-store.port';
import { assertStorageIdentity } from '../domain/document-policy';
import { encryptEnvelope,decryptEnvelope,loadKeyring,EnvelopeError,isEncryptedEnvelope } from './aes-gcm-envelope';
import { createHash } from 'node:crypto';
const STORAGE_NAME=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.blob$/i;
function validateName(name:string){if(!STORAGE_NAME.test(name))throw new EnvelopeError('Invalid encrypted storage filename');}
@Injectable()
export class EncryptedLocalBlobStore implements EncryptedBlobStore {
 private folder(){return resolve(process.env.UPLOAD_DIR||'./private-uploads');}
 private async directory(){await mkdir(this.folder(),{recursive:true,mode:0o700});await chmod(this.folder(),0o700);}
 async put(identity:DocumentIdentity,plaintext:Buffer):Promise<BlobReceipt>{
  assertStorageIdentity(identity.id,identity.organizationId,identity.sha256);
  const keyring=loadKeyring();const storedName=`${identity.id}.blob`;
  if(createHash('sha256').update(plaintext).digest('hex')!==identity.sha256.toLowerCase())throw new EnvelopeError('Plaintext digest differs from identity');
  const encrypted=encryptEnvelope(plaintext,identity,keyring);
  await this.directory();
  const handle=await open(join(this.folder(),storedName),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(encrypted);await handle.sync();}catch(e){await handle.close();await unlink(join(this.folder(),storedName)).catch(()=>{});throw e;}
  finally{await handle.close().catch(()=>{});}
  return {storedName,storageFormat:'AES_256_GCM_V1',encryptionKeyId:keyring.activeId};
 }
 async get(identity:DocumentIdentity,storedName:string):Promise<Buffer>{
  assertStorageIdentity(identity.id,identity.organizationId,identity.sha256);validateName(storedName);
  if(storedName!==`${identity.id}.blob`)throw new EnvelopeError('Storage identity does not match record');
  const handle=await open(join(this.folder(),storedName),constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const info=await handle.stat();if(!info.isFile()||info.size>7*1024*1024)throw new EnvelopeError();
   const encrypted=await handle.readFile();
   if(!isEncryptedEnvelope(encrypted))throw new EnvelopeError('Legacy plaintext must be migrated');
   return decryptEnvelope(encrypted,identity,loadKeyring());
  }finally{await handle.close();}
 }
 async delete(storedName:string):Promise<void>{validateName(storedName);await unlink(join(this.folder(),storedName)).catch((err:any)=>{if(err?.code!=='ENOENT')throw err;});}
 /** Dedicated offline migration only; never expose through the HTTP controller. */
 async encryptLegacy(identity:DocumentIdentity,storedName:string):Promise<'migrated'|'already-encrypted'>{
  assertStorageIdentity(identity.id,identity.organizationId,identity.sha256);validateName(storedName);
  if(storedName!==`${identity.id}.blob`)throw new EnvelopeError('Storage identity mismatch');
  await this.directory();
  const path=join(this.folder(),storedName),h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let input:Buffer;
  try{const s=await h.stat();if(!s.isFile()||s.size>5*1024*1024)throw new EnvelopeError('Invalid existing file');input=await h.readFile();}
  finally{await h.close();}
  if(isEncryptedEnvelope(input)){decryptEnvelope(input,identity,loadKeyring());return 'already-encrypted';}
  if(createHash('sha256').update(input).digest('hex')!==identity.sha256.toLowerCase())throw new EnvelopeError('Legacy file digest mismatch');
  const keyring=loadKeyring(),encrypted=encryptEnvelope(input,identity,keyring);
  const tmp=join(this.folder(),`.${identity.id}.${process.pid}.tmp`);
  const file=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(encrypted);await file.sync();}catch(e){await file.close().catch(()=>{});await unlink(tmp).catch(()=>{});throw e;}
  finally{await file.close().catch(()=>{});}
  try{await rename(tmp,path);}catch(e){await unlink(tmp).catch(()=>{});throw e;}
  return 'migrated';
 }
}
