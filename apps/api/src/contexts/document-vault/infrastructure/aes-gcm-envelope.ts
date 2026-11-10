import { createCipheriv,createDecipheriv,randomBytes,timingSafeEqual,createHash } from 'node:crypto';
import { assertStorageIdentity } from '../domain/document-policy';
import type { DocumentIdentity } from '../application/blob-store.port';

/** Format: ATDOC1 | 1 byte key-id length | key-id | 12 byte nonce | 16 byte tag | ciphertext. */
const MAGIC=Buffer.from('ATDOC1','ascii');
const NONCE=12,TAG=16;
export class EnvelopeError extends Error{constructor(message='Encrypted document cannot be authenticated'){super(message);this.name='EnvelopeError';}}
export type Keyring={activeId:string;keys:ReadonlyMap<string,Buffer>};
const keyIdOk=(v:string)=>/^[a-zA-Z0-9_-]{1,48}$/.test(v);
export function loadKeyring(env:NodeJS.ProcessEnv=process.env):Keyring{
 const activeId=env.DOCUMENT_ACTIVE_KEY_ID||'';
 let raw:Record<string,unknown>;
 try{raw=JSON.parse(env.DOCUMENT_ENCRYPTION_KEYS||'{}');}catch{throw new EnvelopeError('Malformed DOCUMENT_ENCRYPTION_KEYS configuration');}
 if(!raw||Array.isArray(raw)||typeof raw!=='object'||!keyIdOk(activeId))throw new EnvelopeError('Invalid document key configuration');
 const keys=new Map<string,Buffer>();
 for(const [id,value] of Object.entries(raw)){
  if(!keyIdOk(id)||typeof value!=='string'||!/^[0-9a-fA-F]{64}$/.test(value))throw new EnvelopeError('Document key must be 32 bytes, hex-encoded');
  keys.set(id,Buffer.from(value,'hex'));
 }
 if(!keys.has(activeId))throw new EnvelopeError('Active document encryption key is not configured');
 return {activeId,keys};
}
function associatedData(d:DocumentIdentity){
 assertStorageIdentity(d.id,d.organizationId,d.sha256);
 return Buffer.from(`assettrust-document-v1|${d.organizationId.toLowerCase()}|${d.id.toLowerCase()}|${d.sha256.toLowerCase()}`,'utf8');
}
export function isEncryptedEnvelope(b:Buffer):boolean{return b.length>=MAGIC.length && b.subarray(0,MAGIC.length).equals(MAGIC);}
export function encryptEnvelope(plaintext:Buffer,identity:DocumentIdentity,keyring:Keyring):Buffer{
 const aad=associatedData(identity),key=keyring.keys.get(keyring.activeId);
 if(!key||plaintext.length<1)throw new EnvelopeError('Encryption configuration or input is missing');
 const nonce=randomBytes(NONCE),cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 const keyId=Buffer.from(keyring.activeId,'ascii');
 return Buffer.concat([MAGIC,Buffer.from([keyId.length]),keyId,nonce,cipher.getAuthTag(),ciphertext]);
}
export function decryptEnvelope(payload:Buffer,identity:DocumentIdentity,keyring:Keyring):Buffer{
 const aad=associatedData(identity);
 try{
  if(!isEncryptedEnvelope(payload)||payload.length<MAGIC.length+1+1+NONCE+TAG+1)throw new EnvelopeError();
  const len=payload[MAGIC.length],start=MAGIC.length+1;
  if(len<1||len>48||payload.length<=start+len+NONCE+TAG)throw new EnvelopeError();
  const id=payload.subarray(start,start+len).toString('ascii');
  if(!keyIdOk(id))throw new EnvelopeError();
  const key=keyring.keys.get(id);
  if(!key)throw new EnvelopeError('Missing historical encryption key');
  const nonce=payload.subarray(start+len,start+len+NONCE);
  const tag=payload.subarray(start+len+NONCE,start+len+NONCE+TAG);
  const ciphertext=payload.subarray(start+len+NONCE+TAG);
  const decipher=createDecipheriv('aes-256-gcm',key,nonce);
  decipher.setAAD(aad);decipher.setAuthTag(tag);
  const decrypted=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  const digest=Buffer.from(createHash('sha256').update(decrypted).digest('hex'),'hex');
  const expected=Buffer.from(identity.sha256,'hex');
  if(!timingSafeEqual(digest,expected))throw new EnvelopeError();
  return decrypted;
 }catch(error){if(error instanceof EnvelopeError)throw error;throw new EnvelopeError();}
}
/** Parses key identifier without exposing content or importing the key material. */
export function envelopeKeyId(payload:Buffer):string{
 if(!isEncryptedEnvelope(payload)||payload.length<MAGIC.length+1)throw new EnvelopeError();
 const n=payload[MAGIC.length],start=MAGIC.length+1;
 if(n<1||n>48||payload.length<=start+n+NONCE+TAG)throw new EnvelopeError();
 const id=payload.subarray(start,start+n).toString('ascii');if(!keyIdOk(id))throw new EnvelopeError();return id;
}
