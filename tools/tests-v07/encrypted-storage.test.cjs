const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const ts=(()=>{try{return require('typescript')}catch{return require(require('node:path').join(require('node:child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();const Module=require('node:module');const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='@nestjs/common')return {Injectable:()=>target=>target};return originalLoad.call(this,request,parent,isMain)};
require.extensions['.ts']=function(module,filename){const src=fs.readFileSync(filename,'utf8');const js=ts.transpileModule(src,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,experimentalDecorators:true}}).outputText;module._compile(js,filename)};
const {EncryptedLocalBlobStore}=require('../../apps/api/src/contexts/document-vault/infrastructure/encrypted-local-blob.store.ts');
const {isEncryptedEnvelope}=require('../../apps/api/src/contexts/document-vault/infrastructure/aes-gcm-envelope.ts');
const bytes=Buffer.from('%PDF-1.7\nSensitive record');
const doc={id:'62c987c6-a5bd-4502-bef0-caa7c66be6f3',organizationId:'f159c7b2-2af4-4887-81b1-8fda3d13c858',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
function env(dir){process.env.UPLOAD_DIR=dir;process.env.DOCUMENT_ACTIVE_KEY_ID='unit';process.env.DOCUMENT_ENCRYPTION_KEYS=JSON.stringify({unit:crypto.randomBytes(32).toString('hex')})}
test('local encrypted file write/read/cleanup round trip and permissions',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'assettrust-v07-'));env(dir);
 try{
  const store=new EncryptedLocalBlobStore(),receipt=await store.put(doc,bytes);
  assert.equal(receipt.storageFormat,'AES_256_GCM_V1');
  const filePath=path.join(dir,receipt.storedName),disk=await fsp.readFile(filePath);
  assert.ok(isEncryptedEnvelope(disk));assert.ok(!disk.includes(bytes));
  assert.equal((await store.get(doc,receipt.storedName)).toString(),bytes.toString());
  if(process.platform!=='win32')assert.equal((await fsp.stat(filePath)).mode&0o777,0o600);
  await store.delete(receipt.storedName);await assert.rejects(fsp.stat(filePath));
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
test('path traversal, mismatched ID and symlink reads are rejected',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'assettrust-v07-'));env(dir);
 try{
  const store=new EncryptedLocalBlobStore();const r=await store.put(doc,bytes);
  await assert.rejects(store.get(doc,'../../etc/passwd'));
  await assert.rejects(store.get({...doc,id:'62c987c6-a5bd-4502-bef0-caa7c66be6f4'},r.storedName));
  const target=path.join(dir,'original');await fsp.rename(path.join(dir,r.storedName),target);await fsp.symlink(target,path.join(dir,r.storedName));
  await assert.rejects(store.get(doc,r.storedName));
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
test('explicit migration encrypts legacy records, supports interrupted reconciliation',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'assettrust-v07-'));env(dir);
 try{
  const name=`${doc.id}.blob`;await fsp.writeFile(path.join(dir,name),bytes);
  const store=new EncryptedLocalBlobStore();
  await assert.rejects(store.get(doc,name));
  assert.equal(await store.encryptLegacy(doc,name),'migrated');
  assert.equal(await store.encryptLegacy(doc,name),'already-encrypted');
  assert.equal((await store.get(doc,name)).toString(),bytes.toString());
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
