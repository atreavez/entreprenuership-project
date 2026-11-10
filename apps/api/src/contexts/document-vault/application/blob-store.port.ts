export type DocumentIdentity={id:string;organizationId:string;sha256:string};
export type BlobReceipt={storedName:string;storageFormat:'AES_256_GCM_V1';encryptionKeyId:string};
/** Application port: infrastructure may be local encrypted disk or future private object storage. */
export interface EncryptedBlobStore {
 put(identity:DocumentIdentity,plaintext:Buffer):Promise<BlobReceipt>;
 get(identity:DocumentIdentity,storedName:string):Promise<Buffer>;
 delete(storedName:string):Promise<void>;
}
export const ENCRYPTED_BLOB_STORE=Symbol('ENCRYPTED_BLOB_STORE');
