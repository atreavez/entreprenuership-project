const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const ts=(()=>{try{return require('typescript')}catch{return require(require('node:path').join(require('node:child_process').execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}})();
// Offline test loader for dependency-free TypeScript modules. The NestJS build uses its normal tsc path.
require.extensions['.ts']=function(module,filename){const src=fs.readFileSync(filename,'utf8');const js=ts.transpileModule(src,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;module._compile(js,filename)};
const {assertAllowedDocument,assertStorageIdentity,requireEncryptedFormat,DocumentPolicyError}=require('../../apps/api/src/contexts/document-vault/domain/document-policy.ts');
const {encryptEnvelope,decryptEnvelope,loadKeyring,isEncryptedEnvelope,envelopeKeyId,EnvelopeError}=require('../../apps/api/src/contexts/document-vault/infrastructure/aes-gcm-envelope.ts');
const original=Buffer.from('%PDF-1.7\nSample private evidence\n');
const same={id:'62c987c6-a5bd-4502-bef0-caa7c66be6f3',organizationId:'f159c7b2-2af4-4887-81b1-8fda3d13c858',sha256:crypto.createHash('sha256').update(original).digest('hex')};
const keys=new Map([['k2026',crypto.randomBytes(32)],['k2027',crypto.randomBytes(32)]]);
const ring={activeId:'k2026',keys};
test('file type must match file signature and enforce 5 MiB maximum',()=>{
 assert.doesNotThrow(()=>assertAllowedDocument(original,'application/pdf'));
 assert.throws(()=>assertAllowedDocument(original,'image/png'),DocumentPolicyError);
 assert.throws(()=>assertAllowedDocument(original,'application/x-msdownload'),DocumentPolicyError);
 assert.throws(()=>assertAllowedDocument(Buffer.alloc(0),'application/pdf'),DocumentPolicyError);
 assert.throws(()=>assertAllowedDocument(Buffer.concat([original,Buffer.alloc(5*1024*1024)]),'application/pdf'),DocumentPolicyError);
});
test('record identity must be UUID and SHA-256; legacy plaintext fails closed',()=>{
 assert.doesNotThrow(()=>assertStorageIdentity(same.id,same.organizationId,same.sha256));
 assert.throws(()=>assertStorageIdentity('../../etc/passwd',same.organizationId,same.sha256),DocumentPolicyError);
 assert.throws(()=>requireEncryptedFormat('LEGACY_PLAINTEXT'),DocumentPolicyError);
 assert.doesNotThrow(()=>requireEncryptedFormat('AES_256_GCM_V1'));
});
test('AES-256-GCM protects contents and authenticates metadata',()=>{
 const sealed=encryptEnvelope(original,same,ring);
 assert.ok(isEncryptedEnvelope(sealed));assert.equal(envelopeKeyId(sealed),'k2026');
 assert.equal(decryptEnvelope(sealed,same,ring).toString(),original.toString());
 assert.notEqual(sealed.toString('hex').includes(original.toString('hex')),true);
});
test('fresh nonce produces different ciphertext with the same document',()=>{
 const first=encryptEnvelope(original,same,ring),second=encryptEnvelope(original,same,ring);
 assert.notDeepEqual(first,second);
});
test('tampered ciphertext, tag and IV are rejected',()=>{
 const sealed=encryptEnvelope(original,same,ring);
 for(const index of [sealed.length-1,sealed.length-20,8]){const corrupt=Buffer.from(sealed);corrupt[index]^=1;assert.throws(()=>decryptEnvelope(corrupt,same,ring),EnvelopeError);}
});
test('cross-tenant, cross-document, mismatched digest substitution fails',()=>{
 const sealed=encryptEnvelope(original,same,ring);
 for(const forged of [{...same,id:'62c987c6-a5bd-4502-bef0-caa7c66be6f4'},{...same,organizationId:'f159c7b2-2af4-4887-81b1-8fda3d13c859'},{...same,sha256:'f'.repeat(64)}])assert.throws(()=>decryptEnvelope(sealed,forged,ring),EnvelopeError);
});
test('key rotation keeps old files readable while retaining historical keys',()=>{
 const sealed=encryptEnvelope(original,same,ring);
 const rotated={activeId:'k2027',keys};
 assert.equal(decryptEnvelope(sealed,same,rotated).toString(),original.toString());
 assert.equal(envelopeKeyId(encryptEnvelope(original,same,rotated)),'k2027');
 assert.throws(()=>decryptEnvelope(sealed,same,{activeId:'k2027',keys:new Map([['k2027',keys.get('k2027')]])}),EnvelopeError);
});
test('refuse missing, malformed, and undersized encryption keys',()=>{
 assert.throws(()=>loadKeyring({DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:'{"v1":"abcd"}'}),EnvelopeError);
 assert.throws(()=>loadKeyring({DOCUMENT_ACTIVE_KEY_ID:'v2',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:'a'.repeat(64)})}),EnvelopeError);
 assert.throws(()=>loadKeyring({DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:'not JSON'}),EnvelopeError);
 assert.equal(loadKeyring({DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:'a'.repeat(64)})}).activeId,'v1');
});
test('non-envelope plaintext and malformed headers are never decrypted',()=>{
 assert.throws(()=>decryptEnvelope(original,same,ring),EnvelopeError);
 assert.throws(()=>decryptEnvelope(Buffer.from('ATDOC1\x00'),same,ring),EnvelopeError);
});
