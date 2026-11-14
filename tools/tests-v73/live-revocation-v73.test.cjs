'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const loaded=import('../e2e-document-revocation-v73.mjs');
const OP='postgres://operator:operator_password@127.0.0.1:5432/assettrust_test';
const RT='postgres://assettrust_v57_ci_runtime:runtime_password@127.0.0.1:5432/assettrust_test';
const MARK='assettrust-v73-owned-synthetic-111122223333';
const VERSION=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).version,ASSET='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',DOCUMENT='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',GRANT='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function env(patch={}){return {CI:'true',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'YES',ASSETTRUST_V69_AUTH_CONFIRM:'YES',ASSETTRUST_V73_DOCUMENT_CONFIRM:'YES',DATABASE_URL:OP,ASSETTRUST_RUNTIME_DATABASE_URL:RT,ASSETTRUST_E2E_URL:'http://127.0.0.1:4000',ASSETTRUST_E2E_TARGET_ID:MARK,ASSETTRUST_E2E_EXPECT_TARGET:MARK,...patch};}
function respond(status,obj,{binary=false}={}){const bytes=binary?Buffer.from(obj):Buffer.from(JSON.stringify(obj));return {status,headers:{get:()=>null},arrayBuffer:async()=>bytes,text:async()=>bytes.toString('utf8')};}
function fake({grantRevocationBroken=false,tenantLeak=false,ownershipBroken=false,roleLeak=false}={}){
 const seen=[];let revoked=false,grantExists=false,original=null;
 const fetcher=async(url,options={})=>{
  const route=new URL(url).pathname.replace('/api/v1','');const method=options.method||'GET';
  const token=options.headers?.Authorization?.slice(7)||null;
  seen.push({route,method,token,redirect:options.redirect,body:options.body});
  const isAdmin=token==='admin-A-token-test',other=token==='admin-B-token-test',reviewer=token==='reviewer-token-test';
  if(route==='/healthz')return respond(200,{ok:true,service:'assettrust-api',version:VERSION,e2eTargetId:ownershipBroken?'other-process':MARK});
  if(route==='/readyz')return respond(200,{ok:true,version:VERSION,database:'ready',postgis:'ready',schema:'verified-migration-ledger',security:'rls-policy-contract-verified',migrationsVerified:27,rlsPoliciesVerified:16,protectedTablesVerified:13});
  // Simulated disposable MFA provisioning (never a real credential).
  if(route==='/auth/mfa/enroll')return respond(201,{secret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'});
  if(route==='/auth/mfa/confirm')return respond(201,{enabled:true,recoveryCodes:Array(10).fill('synthetic-test-only')});
  if(route==='/auth/register')return respond(201,{accessToken:JSON.parse(options.body).email.includes('owner-a')?'admin-A-token-test':'admin-B-token-test'});
  if(route==='/assets'&&method==='POST')return respond(201,{id:ASSET});
  if(route==='/team/invitations')return respond(201,{inviteToken:'private-synthetic-invite-secret'});
  if(route==='/team/accept')return respond(201,{ok:true});
  if(route==='/auth/login')return respond(201,{accessToken:'reviewer-token-test'});
  if(route==='/auth/me')return respond(200,{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});
  if(route==='/documents/upload'){
   assert(options.body instanceof FormData);assert.equal(options.body.get('assetId'),ASSET);
   original=Buffer.from(await options.body.get('file').arrayBuffer());
   assert(original.toString('ascii',0,5)==='%PDF-');
   return respond(201,{id:DOCUMENT,storageFormat:'AES_256_GCM_V1'});
  }
  if(route==='/documents/'+DOCUMENT+'/file'){
   if(isAdmin||reviewer&&grantExists&&!revoked||other&&tenantLeak||reviewer&&grantRevocationBroken&&revoked)return respond(200,original,{binary:true});
   return respond(other?404:403,{message:'not authorized'});
  }
  if(route==='/access/assets/'+ASSET+'/grants'&&method==='POST'){grantExists=true;return respond(201,{ok:true});}
  if(route==='/access/assets/'+ASSET+'/grants'&&method==='GET')return respond(200,[{id:GRANT,permission:'READ',email:JSON.parse(seen.find(x=>x.route==='/team/invitations').body).email}]);
  if(route==='/access/grants/'+GRANT&&method==='DELETE'){revoked=true;return respond(200,{ok:true});}
  if(route==='/documents'&&method==='GET')return respond(200,grantRevocationBroken&&revoked?[{id:DOCUMENT}]:[]);
  throw Error('Unexpected test endpoint '+route+' '+method);
 };
 return {fetcher,seen};
}
test('live plan is clearly write-enabled and release-blocked',async()=>{const m=await loaded,p=m.plan();assert.equal(p.productionApproved,false);assert.equal(p.liveTested,false);assert.match(p.effect,/disposable DB/);});
test('local successful fake journey includes encrypted bytes and revocation negative',async()=>{
 const m=await loaded,f=fake();const r=await m.acceptance(env(),f.fetcher,{random:()=> 'a'.repeat(24)});
 assert.equal(r.status,'DOCUMENT_REVOCATION_ACCEPTANCE_PASSED_RELEASE_BLOCKED');assert.equal(r.liveDocumentRevocationPassed,true);
 assert.equal(r.checks.length,11);assert.equal(r.productionApproved,false);
 assert(f.seen.some(x=>x.route==='/documents/upload'&&x.method==='POST'));
 assert(f.seen.some(x=>x.route==='/access/grants/'+GRANT&&x.method==='DELETE'));
});
test('does not contact API without v73 explicit consent',async()=>{
 const m=await loaded,f=fake();const r=await m.acceptance(env({ASSETTRUST_V73_DOCUMENT_CONFIRM:'NO'}),f.fetcher);
 assert.equal(r.status,'BLOCKED');assert.equal(f.seen.length,0);
});
test('cannot run against a remote or production database',async()=>{
 const m=await loaded;for(const patch of [{NODE_ENV:'production'},{DATABASE_URL:'postgres://u:p@remote.example/assettrust_test'},{ASSETTRUST_RUNTIME_DATABASE_URL:OP}]){
  const f=fake();const r=await m.acceptance(env(patch),f.fetcher);assert.equal(r.status,'BLOCKED');assert.equal(f.seen.length,0);
 }
});
test('identity mismatch aborts before a synthetic registration',async()=>{
 const m=await loaded,f=fake({ownershipBroken:true});const r=await m.acceptance(env(),f.fetcher);
 assert.equal(r.status,'BLOCKED');assert.equal(r.syntheticDataCreated,false);assert(!f.seen.some(x=>x.route==='/auth/register'));
});
test('cross-tenant byte leakage fails acceptance',async()=>{
 const m=await loaded,f=fake({tenantLeak:true});const r=await m.acceptance(env(),f.fetcher,{random:()=> 'a'.repeat(24)});
 assert.equal(r.status,'FAILED');assert.equal(r.liveDocumentRevocationPassed,false);
});
test('reading revoked document fails acceptance',async()=>{
 const m=await loaded,f=fake({grantRevocationBroken:true});const r=await m.acceptance(env(),f.fetcher,{random:()=> 'b'.repeat(24)});
 assert.equal(r.status,'FAILED');assert.equal(r.liveDocumentRevocationPassed,false);
});
test('malformed nonce refuses synthetic user writes',async()=>{
 const m=await loaded,f=fake();const r=await m.acceptance(env(),f.fetcher,{random:()=> 'invalid@email'});
 assert.equal(r.status,'FAILED');assert(!f.seen.some(x=>x.route==='/auth/register'));
});
test('saved report uses private mode and excludes test identities and document bytes',async()=>{
 const m=await loaded,root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v73-report-'));
 try{
  const report={schema:'ASSETTRUST_V73_DOCUMENT_REVOCATION',status:'FAILED',issues:['DOCUMENT_TEST_STATUS_MISMATCH'],productionApproved:false};
  const filename=m.saveReport(report,root,()=> 'synthetic-file-name');const st=fs.statSync(filename);
  assert.equal(st.mode&0o077,0);assert(!fs.readFileSync(filename,'utf8').includes('postgres://'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('CI runner includes the new guarded HTTP suite after earlier tests',()=>{
 const runner=fs.readFileSync(path.join(ROOT,'tools/ci-live-integration.mjs'),'utf8');
 assert(runner.includes("'test:e2e:documents:v73'"));
 assert(runner.includes("ASSETTRUST_V73_DOCUMENT_CONFIRM:'YES'"));
 assert(runner.includes('waitForOwnedApiReady'));
});
test('v73 scripts are available and do not auto-run mutating suite during offline verification',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
 assert.equal(pkg.scripts['test:e2e:documents:v73'],'node tools/e2e-document-revocation-v73.mjs --run');
 assert.equal(pkg.scripts['test:e2e:documents:plan:v73'],'node tools/e2e-document-revocation-v73.mjs --plan');
 assert.equal(pkg.scripts['verify:v73'],'node --test tools/tests-v73/*.test.cjs');
});
