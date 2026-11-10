const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../..');const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('document domain/application port have no NestJS, PostgreSQL or HTTP dependencies',()=>{
 for(const p of ['apps/api/src/contexts/document-vault/domain/document-policy.ts','apps/api/src/contexts/document-vault/application/blob-store.port.ts']){
  const source=read(p);assert.doesNotMatch(source,/@nestjs|from ['"]pg['"]|from ['"]express['"]|from ['"]multer['"]/);
 }
});
test('documents controller delegates encryption to injected storage port',()=>{
 const doc=read('apps/api/src/documents.ts');
 assert.match(doc,/ENCRYPTED_BLOB_STORE/);assert.match(doc,/this\.blobs\.put\(identity,b\)/);
 assert.match(doc,/this\.blobs\.get\(/);assert.match(doc,/requireEncryptedFormat/);
 assert.doesNotMatch(doc,/writeFile\(|readFile\(|private-uploads/);
});
test('schema upgrade is explicit and CI includes offline encryption tests',()=>{
 const migrationPlan=require('../migrations/plan.cjs').buildPlan();assert.ok(migrationPlan.some(m=>m.filename==='006_document_encryption.sql')); // v0.11 uses a checksum-ledger CLI, not migrate.ts
 const sql=read('apps/api/sql/006_document_encryption.sql');assert.match(sql,/LEGACY_PLAINTEXT/);assert.match(sql,/AES_256_GCM_V1/);
 const ci=read('.github/workflows/ci.yml');assert.match(ci,/verify:v07/);assert.match(ci,/DOCUMENT_ENCRYPTION_KEYS/);
});
