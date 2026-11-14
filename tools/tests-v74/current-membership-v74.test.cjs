'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../..');
const source=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
function compile(file,imports){
 const mod={exports:{}};
 const code=ts.transpileModule(source(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:id=>{if(!(id in imports))throw Error('Unregistered test import: '+id);return imports[id];},Buffer,Date,Promise,Error,process,console},{timeout:5000,filename:file});
 return mod.exports;
}
class ForbiddenException extends Error{}
class BadRequestException extends Error{}
class NotFoundException extends Error{}
class ServiceUnavailableException extends Error{}
const noop=()=>()=>{};
const nest={ForbiddenException,BadRequestException,NotFoundException,ServiceUnavailableException,Get:noop,Post:noop,Delete:noop,Controller:noop,Module:noop,UseGuards:noop,Injectable:noop,Inject:noop,Req:noop,Param:noop,Body:noop,Res:noop,UseInterceptors:noop,UploadedFile:noop};
const setTenantScope=async(tx,orgId)=>{await tx.query('SET TENANT SCOPE',[orgId]);};
const guards=compile('apps/api/src/contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
const orgId='00000000-0000-4000-8000-000000000111';
const me='00000000-0000-4000-8000-000000000112';
const assetId='00000000-0000-4000-8000-000000000113';
const grantee='00000000-0000-4000-8000-000000000114';
const grantId='00000000-0000-4000-8000-000000000115';
const actor={id:me,organizationId:orgId,role:'ORG_ADMIN'};
const expiresAt=new Date(Date.now()+30*86400000).toISOString();
function setup({dbRole='ORG_ADMIN',suspended=false,assetExists=true,memberExists=true,grantExists=true,documents=[]}={}){
 const calls=[];let audits=0,writes=0;
 const tx={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql==='SET TENANT SCOPE')return {rows:[{ok:true}]};
  if(sql.includes('SELECT id,role FROM users'))return {rows:suspended?[]:[{id:me,role:dbRole}]};
  if(sql.includes('SELECT id FROM assets WHERE'))return {rows:assetExists?[{id:assetId}]:[]};
  if(sql.includes('SELECT id FROM users WHERE'))return {rows:memberExists?[{id:grantee}]:[]};
  if(sql.includes('INSERT INTO resource_grants')){writes++;return {rows:[]};}
  if(sql.includes('DELETE FROM resource_grants')){writes++;return {rows:grantExists?[{asset_id:assetId,grantee_id:grantee}]:[]};}
  if(sql.includes('SELECT g.id,g.permission'))return {rows:grantExists?[{id:grantId,permission:'READ'}]:[]};
  throw Error('Unexpected SQL: '+sql);
 }};
 const db={transaction:async fn=>{calls.push({sql:'BEGIN'});try{const out=await fn(tx);calls.push({sql:'COMMIT'});return out;}catch(e){calls.push({sql:'ROLLBACK'});throw e;}},tenantQuery:async(org,sql,params)=>{
  calls.push({sql,params,org});
  if(sql.includes('FROM documents d JOIN users actor')){
   // Simulate the correct semantics while verifying SQL shape separately.
   if(suspended)return {rows:[]};
   return {rows:documents.filter(d=>dbRole==='ORG_ADMIN'||(d.case_id ? (d.case_creator===me||d.assignee===me):d.asset_creator===me||d.grantee===me))};
  }
  throw Error('Unexpected standalone query: '+sql);
 }};
 const audit={write:async(_tx,_actor,event)=>{audits++;calls.push({sql:'AUDIT '+event});}};
 return {calls,db,audit,get writes(){return writes;},get audits(){return audits;}};
}
const accessImports={
 '@nestjs/common':nest,
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope},
 './contexts/access/infrastructure/transactional-access':guards,
 './database':{Database:class Database{}},'./common':{UserAuth:class{},isUuid:x=>x,assertRole:u=>{if(u.role!=='ORG_ADMIN')throw new ForbiddenException('JWT must claim admin');},uid:()=>grantId},
 './audit':{AuditService:class AuditService{},AuditModule:class AuditModule{}},
 './auth':{AuthGuard:class AuthGuard{},AuthModule:class AuthModule{}}
};
const {AccessController}=compile('apps/api/src/access.ts',accessImports);
const request={user:actor};
const grantBody={granteeId:grantee,permission:'READ',expiresAt};
const controller=f=>new AccessController(f.db,{},f.audit);

test('current administrator guard locks active membership inside same tenant transaction',async()=>{
 const f=setup();await f.db.transaction(async tx=>{await setTenantScope(tx,orgId);await guards.requireCurrentOrganizationAdmin(tx,actor);});
 const sql=f.calls.find(x=>x.sql.includes('SELECT id,role FROM users'));
 assert(sql);assert.match(sql.sql,/organization_id=\$2 AND suspended_at IS NULL FOR SHARE/);
 assert.deepEqual(Array.from(sql.params),[me,orgId]);
 assert(f.calls.findIndex(x=>x.sql==='SET TENANT SCOPE')<f.calls.findIndex(x=>x.sql.includes('SELECT id,role FROM users')));
});
for(const dbRole of ['CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER']){
 test('a stale ORG_ADMIN JWT cannot create grants after current role changes to '+dbRole,async()=>{
  const f=setup({dbRole});await assert.rejects(controller(f).grant(request,assetId,grantBody),ForbiddenException);
  assert.equal(f.writes,0);assert.equal(f.audits,0);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 });
}
test('a suspended administrator cannot create grants even with unexpired JWT',async()=>{
 const f=setup({suspended:true});await assert.rejects(controller(f).grant(request,assetId,grantBody),ForbiddenException);assert.equal(f.writes,0);
});
test('a demoted administrator cannot revoke grants and audit is not emitted',async()=>{
 const f=setup({dbRole:'CLIENT'});await assert.rejects(controller(f).revoke(request,grantId),ForbiddenException);
 assert.equal(f.writes,0);assert.equal(f.audits,0);
});
test('a demoted administrator cannot list grant recipient details',async()=>{
 const f=setup({dbRole:'CLIENT'});await assert.rejects(controller(f).list(request,assetId),ForbiddenException);
 assert(!f.calls.some(x=>x.sql.includes('SELECT g.id,g.permission')));
});
test('current administrator grant uses a locked asset and active grantee before writing',async()=>{
 const f=setup();assert.equal((await controller(f).grant(request,assetId,grantBody)).ok,true);
 assert.equal(f.writes,1);assert.equal(f.audits,1);
 const keys=f.calls.map(x=>x.sql);
 const admin=keys.findIndex(s=>s.includes('SELECT id,role FROM users'));
 const asset=keys.findIndex(s=>s.includes('SELECT id FROM assets'));
 const member=keys.findIndex(s=>s.includes('SELECT id FROM users WHERE'));
 const write=keys.findIndex(s=>s.includes('INSERT INTO resource_grants'));
 assert(admin<asset&&asset<member&&member<write);
 assert.match(keys[asset],/FOR SHARE/);assert.match(keys[member],/suspended_at IS NULL FOR SHARE/);
 assert(keys.indexOf('AUDIT ACCESS_GRANTED')>write);
});
test('administrator cannot grant cross-tenant or nonexistent asset',async()=>{
 const f=setup({assetExists:false});await assert.rejects(controller(f).grant(request,assetId,grantBody),NotFoundException);
 assert.equal(f.writes,0);assert.equal(f.audits,0);
});
test('administrator cannot grant a suspended or outside-tenant member',async()=>{
 const f=setup({memberExists:false});await assert.rejects(controller(f).grant(request,assetId,grantBody),BadRequestException);
 assert.equal(f.writes,0);assert.equal(f.audits,0);
});
test('current administrator can revoke and writes audit inside one transaction',async()=>{
 const f=setup();assert.equal((await controller(f).revoke(request,grantId)).ok,true);
 assert.equal(f.writes,1);assert.equal(f.audits,1);assert.equal(f.calls.at(-1).sql,'COMMIT');
 assert(f.calls.findIndex(x=>x.sql.includes('SELECT id,role FROM users'))<f.calls.findIndex(x=>x.sql.includes('DELETE FROM resource_grants')));
});
test('current administrator can list only verified-asset grants',async()=>{
 const f=setup();const out=await controller(f).list(request,assetId);
 assert.equal(out[0].id,grantId);assert(f.calls.some(x=>x.sql.includes('SELECT id FROM assets')&&x.sql.includes('organization_id=$2')));
});
test('grant change does not produce audit when the database write throws',async()=>{
 const f=setup(),old=f.db.transaction;
 f.db.transaction=async cb=>old(async tx=>cb({...tx,query:async(sql,p)=>{if(sql.includes('INSERT INTO resource_grants'))throw Error('DB write refused');return tx.query(sql,p);}}));
 await assert.rejects(controller(f).grant(request,assetId,grantBody),/DB write refused/);assert.equal(f.audits,0);
});
const docImports={
 '@nestjs/common':nest,'@nestjs/platform-express':{FileInterceptor:noop},'multer':{memoryStorage:()=>({})},
 './database':{Database:class Database{}},'./audit':{AuditModule:class{},AuditService:class{}},
 './auth':{AuthGuard:class{},AuthModule:class{}},
 './common':{UserAuth:class{},uid:()=>grantId,hash:()=>'',assertRole:()=>{},isUuid:x=>x,text:x=>x},
 './access':{AccessModule:class{},AccessService:class{}},
 './contexts/document-vault/domain/document-policy':{assertAllowedDocument:()=>{},DocumentPolicyError:class extends Error{},requireEncryptedFormat:()=>{}},
 './contexts/document-vault/application/blob-store.port':{ENCRYPTED_BLOB_STORE:'blobs'},
 './contexts/document-vault/infrastructure/encrypted-local-blob.store':{EncryptedLocalBlobStore:class{}},
 './contexts/document-vault/application/malware-scanner.port':{DOCUMENT_MALWARE_SCANNER:'scanner',DocumentScanError:class extends Error{}},
 './contexts/document-vault/infrastructure/clamav-instream-scanner':{ClamAvInstreamScanner:class{}},
 './contexts/access/infrastructure/transactional-access':guards,
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope}
};
const {DocumentsService}=compile('apps/api/src/documents.ts',docImports);
const docs=f=>new DocumentsService(f.db,{}, {},{},{});
const D=[{id:'owner-document',case_id:null,asset_creator:me},{id:'other-document',case_id:null,asset_creator:'other',grantee:'other'},{id:'case-private',case_id:'case',case_creator:'other',assignee:'other'}];
test('document listing checks current SQL membership and role, not token role',async()=>{
 const f=setup({dbRole:'CLIENT',documents:D});const rows=await docs(f).list(actor);
 assert.deepEqual(rows.map(x=>x.id),['owner-document']);
 const sql=f.calls.find(x=>x.sql.includes('FROM documents d JOIN users actor'));
 assert(sql);assert.match(sql.sql,/actor\.suspended_at IS NULL/);
 assert.match(sql.sql,/actor\.role='ORG_ADMIN'/);
 assert(!sql.sql.includes('$2::bool'));assert(!sql.sql.includes('u.role'));
 assert.deepEqual(Array.from(sql.params),[orgId,me]);
});
test('suspended actor gets no documents even if token claims ORG_ADMIN',async()=>{
 const f=setup({suspended:true,documents:D});assert.deepEqual(await docs(f).list(actor),[]);
});
test('a current administrator may list organization documents',async()=>{
 const f=setup({dbRole:'ORG_ADMIN',documents:D});const rows=await docs(f).list(actor);assert.equal(rows.length,3);
});
test('case evidence is not revealed through an ordinary asset grant in document listing',async()=>{
 const f=setup({dbRole:'CLIENT',documents:[{id:'sensitive-case-doc',case_id:'case',grantee:me,case_creator:'someone-else',assignee:'someone-else'}]});
 assert.equal((await docs(f).list(actor)).length,0);
 const sql=f.calls.find(x=>x.sql.includes('FROM documents d JOIN users actor')).sql;
 assert.match(sql,/d\.case_id IS NOT NULL/);assert.match(sql,/d\.case_id IS NULL/);
});
test('v74 does not change any SQL migrations or weaken the required RLS contract',()=>{
 assert.equal(fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(x=>/^\d{3}_.*\.sql$/.test(x)).length,27);
 const policy=source('apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts');
 assert(policy.includes('PROTECTED_TABLES'));assert(policy.includes('inspectPolicyInventory'));
});
