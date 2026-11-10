#!/usr/bin/env node
/** Offline migration: run with API stopped and full backup in place. Never runs automatically. */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
// Workspace API normally resolves relative UPLOAD_DIR from apps/api, not repo root.
if(!process.env.UPLOAD_DIR || !process.env.UPLOAD_DIR.startsWith('/')) process.env.UPLOAD_DIR=resolve('apps/api',process.env.UPLOAD_DIR||'./private-uploads');
if(process.env.ASSETTRUST_STORAGE_MIGRATION_CONFIRM!=='YES'){
 console.error('Refusing to modify stored documents. Make an offline backup, stop the API, set ASSETTRUST_STORAGE_MIGRATION_CONFIRM=YES.');process.exit(2);
}
require('ts-node/register');
const {Pool}=require('pg');
const {EncryptedLocalBlobStore}=require('../apps/api/src/contexts/document-vault/infrastructure/encrypted-local-blob.store.ts');
const {loadKeyring,envelopeKeyId}=require('../apps/api/src/contexts/document-vault/infrastructure/aes-gcm-envelope.ts');
async function run(){
 loadKeyring();
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
 const store=new EncryptedLocalBlobStore();let processed=0,converted=0;
 try{
  // Process all rows: a crash between atomic file rename and metadata update can be reconciled.
  const rows=(await db.query('SELECT id,organization_id,stored_name,sha256,storage_format FROM documents ORDER BY id')).rows;
  for(const row of rows){
   const identity={id:row.id,organizationId:row.organization_id,sha256:row.sha256};
   if(row.storage_format==='AES_256_GCM_V1'){
    // Validate encrypted content too, even if the database already reports it as encrypted.
    await store.get(identity,row.stored_name);processed++;continue;
   }
   const result=await store.encryptLegacy(identity,row.stored_name);
   // The active key may differ from the file's key if this file was already upgraded earlier.
   const encrypted=await (await import('node:fs/promises')).readFile(resolve(process.env.UPLOAD_DIR||'./private-uploads',row.stored_name));
   const keyId=envelopeKeyId(encrypted);
   await db.query(`UPDATE documents SET storage_format='AES_256_GCM_V1',encryption_key_id=$2 WHERE id=$1 AND storage_format='LEGACY_PLAINTEXT'`,[row.id,keyId]);
   converted+=result==='migrated'?1:0;processed++;
   console.log('Checked encrypted document',row.id,'(no plaintext printed)');
  }
  console.log(`Migration finished: checked=${processed}, encrypted=${converted}. Run a second verification pass before deploy.`);
 }finally{await db.end();}
}
run().catch(e=>{console.error('Migration halted; resolve the issue and rerun. No automatic rollback of already re-encrypted files.',e.message);process.exitCode=1;});
