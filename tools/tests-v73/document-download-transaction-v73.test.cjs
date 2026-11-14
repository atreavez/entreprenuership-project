'use strict';
/** Actual transpiled service + access-policy tests; PostgreSQL fixtures are synthetic. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../..');
function read(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');}
function compile(rel,imports){
 const filename=path.join(ROOT,rel),mod={exports:{}};
 const code=ts.transpileModule(read(rel),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:(id)=>{
  if(!(id in imports))throw Error('Unexpected dependency: '+id);return imports[id];
 },Buffer,Date,Promise,Error,process,console},{filename,timeout:5000});
 return mod.exports;
}
class ForbiddenException extends Error{}
class NotFoundException extends Error{}
class BadRequestException extends Error{}
class ServiceUnavailableException extends Error{}
const noop=()=>()=>{};
const nest={ForbiddenException,NotFoundException,BadRequestException,ServiceUnavailableException,Injectable:noop,Inject:noop,Controller:noop,Module:noop,UseGuards:noop,UseInterceptors:noop,Get:noop,Post:noop,Param:noop,Body:noop,Req:noop,Res:noop,UploadedFile:noop};
const access=compile('apps/api/src/contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
class DocumentPolicyError extends Error{}
const digest=content=>crypto.createHash('sha256').update(content).digest('hex');
const identity={id:'a0000000-0000-4000-8000-000000000123',organization_id:'o0000000-0000-4000-8000-000000000123',sha256:digest(Buffer.from('validated-encrypted-plaintext')),asset_id:'asset-a',case_id:null,storage_format:'AES_256_GCM_V1',stored_name:'a0000000-0000-4000-8000-000000000123.blob',mime_type:'application/pdf',display_name:'proof.pdf'};
const imports={
 '@nestjs/common':nest,
 '@nestjs/platform-express':{FileInterceptor:noop},
 'multer':{memoryStorage:()=>({})},
 './database':{Database:class Database{}},
 './audit':{AuditService:class AuditService{},AuditModule:class AuditModule{}},
 './auth':{AuthGuard:class AuthGuard{},AuthModule:class AuthModule{}},
 './common':{uid:()=>identity.id,hash:digest,assertRole:()=>{},isUuid:x=>x,text:x=>x},
 './access':{AccessService:class AccessService{},AccessModule:class AccessModule{}},
 './contexts/document-vault/domain/document-policy':{assertAllowedDocument:()=>{},DocumentPolicyError,requireEncryptedFormat:(name)=>{if(name!=='AES_256_GCM_V1')throw new DocumentPolicyError('legacy');}},
 './contexts/document-vault/application/blob-store.port':{ENCRYPTED_BLOB_STORE:'blob-port'},
 './contexts/document-vault/infrastructure/encrypted-local-blob.store':{EncryptedLocalBlobStore:class {}},
 './contexts/document-vault/application/malware-scanner.port':{DOCUMENT_MALWARE_SCANNER:'scan-port',DocumentScanError:class DocumentScanError extends Error{}},
 './contexts/document-vault/infrastructure/clamav-instream-scanner':{ClamAvInstreamScanner:class {}},
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async(tx,org)=>{await tx.query('SET TENANT SCOPE',[org]);}},
 './contexts/access/infrastructure/transactional-access':access
};
const {DocumentsService}=compile('apps/api/src/documents.ts',imports);
const user={id:'user-1',organizationId:identity.organization_id,role:'CLIENT'};
function fixture({doc=identity,current={id:identity.asset_id,created_by:'other-user',role:'CLIENT'},cases=[],grants=[{id:'grant-1'}],caseCurrent=null,content=Buffer.from('validated-encrypted-plaintext'),blobFailure=null}={}){
 const calls=[];let readCount=0;
 const tx={query:async(sql,params=[])=>{
  calls.push({event:'QUERY',sql,params});
  if(sql==='SET TENANT SCOPE')return {rows:[{ok:true}]};
  if(sql.startsWith('SELECT * FROM documents'))return {rows:doc?[doc]:[]};
  if(sql.includes('FROM assets a JOIN users actor'))return {rows:current?[current]:[]};
  if(sql.includes('FROM verification_cases c JOIN users actor'))return {rows:caseCurrent?[caseCurrent]:[]};
  if(sql.includes('FROM verification_cases c'))return {rows:cases};
  if(sql.includes('FROM resource_grants g'))return {rows:grants};
  throw new Error('Unexpected SQL: '+sql);
 }};
 const db={transaction:async fn=>{calls.push({event:'BEGIN'});try{const result=await fn(tx);calls.push({event:'COMMIT'});return result;}catch(err){calls.push({event:'ROLLBACK'});throw err;}},tenantQuery:async()=>{throw Error('Outside-transaction document lookup forbidden');}};
 const blobs={get:async()=>{readCount++;calls.push({event:'BLOB_READ'});if(blobFailure)throw blobFailure;return content;}};
 const svc=new DocumentsService(db,{}, {asset:async()=>{throw Error('stale preflight access check');},case:async()=>{throw Error('stale preflight access check');}},blobs,{});
 return {svc,calls,get readCount(){return readCount;}};
}
const run=f=>f.svc.getBytes(user,identity.id);
test('current permission, metadata and encrypted bytes all remain inside one transaction',async()=>{
 const f=fixture();const result=await run(f);
 assert.equal(result.name,'proof.pdf');assert.equal(result.content.toString(),'validated-encrypted-plaintext');
 assert.deepEqual(f.calls.map(x=>x.event).filter(x=>x!=='QUERY'),['BEGIN','BLOB_READ','COMMIT']);
 assert.equal(f.calls[1].sql,'SET TENANT SCOPE');
 assert.match(f.calls[2].sql,/WHERE id=\$1 AND organization_id=\$2 FOR SHARE/);
 const asset=f.calls.find(x=>x.sql?.includes('FROM assets a JOIN users actor'));
 assert.match(asset.sql,/FOR SHARE OF a,actor/);
 const grant=f.calls.find(x=>x.sql?.includes('FROM resource_grants g'));
 assert.match(grant.sql,/FOR SHARE/);assert.match(grant.sql,/expires_at>now\(\)/);
});
test('revoked READ grant cannot get encrypted bytes',async()=>{
 const f=fixture({grants:[]});await assert.rejects(run(f),ForbiddenException);
 assert.equal(f.readCount,0);assert.equal(f.calls.at(-1).event,'ROLLBACK');
});
test('suspended or deleted current member cannot get bytes',async()=>{
 const f=fixture({current:null});await assert.rejects(run(f),NotFoundException);assert.equal(f.readCount,0);
});
test('current database role takes precedence over stale JWT role snapshot',async()=>{
 const f=fixture({current:{id:identity.asset_id,created_by:'else',role:'ORG_ADMIN'},grants:[]});
 await run(f);assert.equal(f.readCount,1);assert(!f.calls.some(x=>x.sql?.includes('FROM resource_grants g')));
});
test('asset creator can read with no grant',async()=>{
 const f=fixture({current:{id:identity.asset_id,created_by:user.id,role:'CLIENT'},grants:[]});
 await run(f);assert.equal(f.readCount,1);
});
test('a stale administrator role claim cannot override a demoted database role',async()=>{
 const f=fixture({current:{id:identity.asset_id,created_by:'different',role:'CLIENT'},grants:[]});
 await assert.rejects(f.svc.getBytes({...user,role:'ORG_ADMIN'},identity.id),ForbiddenException);
 assert.equal(f.readCount,0);
});
test('asset-only read grant does not grant confidential case access',async()=>{
 const f=fixture({doc:{...identity,case_id:'case-restricted'},grants:[{id:'read-grant'}],caseCurrent:null});
 await assert.rejects(run(f),ForbiddenException);assert.equal(f.readCount,0);
});
test('case participation on asset permits download with no explicit grant',async()=>{
 const f=fixture({cases:[{id:'case-1'}],grants:[]});await run(f);assert.equal(f.readCount,1);
});
test('case evidence requires current case assignment, not only asset grant',async()=>{
 const f=fixture({doc:{...identity,case_id:'case-1'},caseCurrent:{id:'case-1',created_by:'other',assigned_to:'other',role:'CLIENT'}});
 await assert.rejects(run(f),ForbiddenException);assert.equal(f.readCount,0);
});
test('case evidence allows current assigned reviewer with asset visibility',async()=>{
 const f=fixture({doc:{...identity,case_id:'case-1'},caseCurrent:{id:'case-1',created_by:'other',assigned_to:user.id,role:'REVIEWER'},cases:[{id:'case-1'}]});
 await run(f);assert.equal(f.readCount,1);assert(f.calls.some(x=>x.sql?.includes('FOR SHARE OF c,actor')));
});
test('case-only document denies user without case participation',async()=>{
 const f=fixture({doc:{...identity,asset_id:null,case_id:'case-1'},caseCurrent:null});
 await assert.rejects(run(f),ForbiddenException);assert.equal(f.readCount,0);
});
test('case-only document allows current case creator',async()=>{
 const f=fixture({doc:{...identity,asset_id:null,case_id:'case-1'},caseCurrent:{id:'case-1',created_by:user.id,assigned_to:'other',role:'CLIENT'}});
 await run(f);assert.equal(f.readCount,1);
});
test('document without asset or case fails closed',async()=>{
 const f=fixture({doc:{...identity,asset_id:null,case_id:null}});await assert.rejects(run(f),NotFoundException);assert.equal(f.readCount,0);
});
test('missing tenant document fails before authorization or decryption',async()=>{
 const f=fixture({doc:null});await assert.rejects(run(f),NotFoundException);assert.equal(f.readCount,0);
});
test('plaintext legacy object is refused before blob retrieval',async()=>{
 const f=fixture({doc:{...identity,storage_format:'PLAINTEXT_V0'}});await assert.rejects(run(f),BadRequestException);assert.equal(f.readCount,0);
});
test('digest mismatch fails closed and does not return decrypted bytes',async()=>{
 const f=fixture({content:Buffer.from('tampered-data')});await assert.rejects(run(f),BadRequestException);assert.equal(f.calls.at(-1).event,'ROLLBACK');
});
test('encrypted storage failure is concealed from client and rolled back',async()=>{
 const f=fixture({blobFailure:new Error('should-not-leak-key-id-123')});
 await assert.rejects(run(f),e=>e instanceof BadRequestException&&!e.message.includes('key-id-123'));
 assert.equal(f.calls.at(-1).event,'ROLLBACK');
});
test('the service never uses a standalone authorization query during a document download',()=>{
 const s=read('apps/api/src/documents.ts');const download=s.slice(s.indexOf('async getBytes('),s.indexOf('\n}\n@Controller',s.indexOf('async getBytes(')));
 assert(download.includes('this.db.transaction('));assert(!download.includes('this.db.tenantQuery('));assert(!download.includes('this.access.asset('));assert(!download.includes('this.access.case('));
 assert(download.includes('requireCurrentAssetRead(tx'));assert(download.includes('requireCurrentCaseRead(tx'));
});
test('SQL stays parameterized, tenant scoped and row locks cover member and grant edges',()=>{
 const s=read('apps/api/src/contexts/access/infrastructure/transactional-access.ts');
 assert(s.includes('actor.suspended_at IS NULL'));
 assert(s.includes('g.grantee_id=$3 AND g.expires_at>now()'));
 assert(s.includes('FOR SHARE OF c,actor'));
 assert(s.includes('FOR SHARE OF a,actor'));
 assert(s.includes('LIMIT 1 FOR SHARE'));
});
test('milestone manifests and CI record tests without changing 27 SQL migrations',()=>{
 const root=JSON.parse(read('package.json')),api=JSON.parse(read('apps/api/package.json')),web=JSON.parse(read('apps/web/package.json'));
 assert.match(root.version,/^0\.(?:7[3-9]|[89][0-9]|[1-9][0-9]{2,})\.0$/);assert.equal(root.version,api.version);assert.equal(root.version,web.version);
 assert.equal(root.scripts['verify:v73'],'node --test tools/tests-v73/*.test.cjs');
 assert.match(read('.github/workflows/ci.yml'),/npm run verify:v73/);
 assert.equal(fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(x=>/^\d{3}_.*\.sql$/.test(x)).length,27);
});
