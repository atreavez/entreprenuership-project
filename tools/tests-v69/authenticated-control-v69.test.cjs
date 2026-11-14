'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const mod=import('../e2e-authenticated-control-v69.mjs');
const OP='postgres://operator:operator_password@127.0.0.1:5432/assettrust_test';
const RT='postgres://assettrust_v57_ci_runtime:runtime_password@127.0.0.1:5432/assettrust_test';
const MARK='assettrust-v69-test-owned-abcdefgh-123456';
function env(overrides={}){return {CI:'true',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'YES',ASSETTRUST_V69_AUTH_CONFIRM:'YES',DATABASE_URL:OP,ASSETTRUST_RUNTIME_DATABASE_URL:RT,ASSETTRUST_E2E_URL:'http://127.0.0.1:4000',ASSETTRUST_E2E_TARGET_ID:MARK,ASSETTRUST_E2E_EXPECT_TARGET:MARK,...overrides};}
function respond(status,body){return {status,ok:status>=200&&status<300,headers:{get:()=>null},text:async()=>JSON.stringify(body)};}
function fake({badReady=false,badOwned=false,denyPlatform=false,badLogout=false}={}){
 const calls=[];let signedOut=false;
 const version=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).version;
 const a='token-admin-A-abcdefghijklmnopqrstuvwxyz',b='token-admin-B-abcdefghijklmnopqrstuvwxyz',r='token-reviewer-abcdefghijklmnopqrstuvwxyz';
 const assetId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const fetcher=async (url,opts={})=>{
  const route=new URL(url).pathname.replace('/api/v1','')+new URL(url).search;
  calls.push({url,route,opts});
  assert.equal(opts.redirect,'error');
  if(route==='/healthz')return respond(200,{service:'assettrust-api',ok:true,version,e2eTargetId:badOwned?'unrecognized-process':MARK});
  if(route==='/readyz')return respond(200,{ok:true,version,database:'ready',postgis:'ready',schema:'verified-migration-ledger',security:'rls-policy-contract-verified',migrationsVerified:27,rlsPoliciesVerified:badReady?15:16,protectedTablesVerified:13});
  // Simulated disposable MFA provisioning (never a real credential).
  if(route==='/auth/mfa/enroll')return respond(201,{secret:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'});
  if(route==='/auth/mfa/confirm')return respond(201,{enabled:true,recoveryCodes:Array(10).fill('synthetic-test-only')});
  if(route==='/auth/register'){
   const body=JSON.parse(opts.body);return respond(201,{accessToken:body.email.includes('v69-a')?a:b});
  }
  const token=opts.headers?.Authorization?.replace('Bearer ','');
  if(route==='/auth/me'){
   if(token===r&&signedOut)return respond(401,{message:'Unauthorized'});
   return respond(200,{organizationId:token===a?'orgA':'orgB'});
  }
  if(route==='/admin-control/me'){
   if(token===r)return respond(403,{message:'Forbidden'});
   return respond(200,{canOrganizationAdmin:true,canPlatformAdmin:false});
  }
  if(route==='/admin-control/organizations'||route==='/admin-control/catalog?scope=platform')
   return respond(denyPlatform?200:403,denyPlatform?{organizations:[]}:{message:'Forbidden'});
  if(route==='/admin-control/catalog?scope=organization'){
   return token===r?respond(403,{message:'Forbidden'}):respond(200,{scope:'organization',items:[{key:'workspace.display_name'}]});
  }
  if(route==='/admin-control/settings?scope=organization')return respond(200,{scope:'organization',values:[]});
  if(route==='/assets'&&opts.method==='POST')return respond(201,{id:assetId});
  if(route==='/assets'&&opts.method==='GET')return respond(200,[]);
  if(route==='/assets/'+assetId)return respond(token===r?403:404,{message:'Not Found'});
  if(route==='/admin-control/changes'||route==='/team/co-admin/invitations')return respond(403,{message:'MFA required'});
  if(route==='/team/invitations')return respond(201,{inviteToken:'test-invite-secret-abcdefghijklmnopqrstuvwxyz'});
  if(route==='/team/accept')return respond(201,{ok:true});
  if(route==='/auth/login')return respond(201,{accessToken:r});
  if(route==='/auth/logout'){signedOut=!badLogout;return respond(201,{ok:true});}
  throw Error('Unexpected request '+route);
 };
 return {fetcher,calls};
}

test('v69 scripts and workspace versions registered consistently',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 assert.match(pkg.version,/^0\.(?:69|7[0-9]|[89][0-9]|[1-9][0-9]{2,})\.0$/);
 for(const rel of ['apps/api/package.json','apps/web/package.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,rel))).version,pkg.version);
 for(const name of ['verify:v69','test:e2e:auth-control:plan:v69','test:e2e:auth-control:v69'])assert.ok(pkg.scripts[name]);
});
test('accepts explicit, identity-bound disposable local environment',async()=>{
 const m=await mod;const v=m.authorize(env());assert.equal(v.dbName,'assettrust_test');assert.equal(v.origin,'http://127.0.0.1:4000');
});
test('rejects missing test consent, production mode and missing restricted role',async()=>{
 const m=await mod;
 for(const patch of [{CI:'false'},{NODE_ENV:'production'},{ASSETTRUST_E2E_ALLOW_MUTATION:'NO'},{ASSETTRUST_V69_AUTH_CONFIRM:'NO'},{ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'NO'}])
  assert.throws(()=>m.authorize(env(patch)),/DISPOSABLE_TEST_CONFIRMATION_REQUIRED/);
});
test('rejects remote and arbitrary database names',async()=>{
 const m=await mod;
 for(const url of ['postgres://u:p@remote.example/assettrust_test','postgres://u:p@127.0.0.1/assettrust_production','postgres://u:p@127.0.0.1/custom_ci','mysql://u:p@127.0.0.1/assettrust_test'])
  assert.throws(()=>m.authorize(env({DATABASE_URL:url})));
});
test('rejects runtime role identical to operator or an unauthorized identity',async()=>{
 const m=await mod;
 for(const url of [OP,'postgres://wrong:pass@127.0.0.1/assettrust_test','postgres://assettrust_v57_ci_runtime:pass@localhost:5434/assettrust_test'])
  assert.throws(()=>m.authorize(env({ASSETTRUST_RUNTIME_DATABASE_URL:url})));
});
test('rejects mismatched runtime target and absent unpredictable process identity',async()=>{
 const m=await mod;
 for(const patch of [{ASSETTRUST_E2E_EXPECT_TARGET:'not-the-running-process-marker-1000'},{ASSETTRUST_E2E_TARGET_ID:''},{ASSETTRUST_E2E_EXPECT_TARGET:'short'}])
  assert.throws(()=>m.authorize(env(patch)),/OWNED_API_MARKER_REQUIRED/);
});
test('blocks non-loopback, redirectable, embedded-credential and malformed API origins',async()=>{
 const m=await mod;
 for(const url of ['https://127.0.0.1:4000','http://192.168.1.1:4000','http://localhost:4000','http://127.0.0.1:80','http://user:pass@127.0.0.1:4000','http://127.0.0.1:4000/evil','http://127.0.0.1:4000/?x=1','http://127.0.0.1:4000/#x'])
  assert.throws(()=>m.authorize(env({ASSETTRUST_E2E_URL:url})),/INVALID_LOCAL_API_ORIGIN/);
});
test('checks version, ownership marker, 27 migrations, 16 policies, 13 tables before mutation',async()=>{
 const m=await mod;const f=fake();const result=await m.inspectOwnedApi(env(),f.fetcher);
 assert.equal(result.version,JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'))).version);assert.equal(f.calls.length,2);assert.equal(f.calls[0].route,'/healthz');assert.equal(f.calls[1].route,'/readyz');
});
test('rejects other local listener before consulting readiness or creating a tenant',async()=>{
 const m=await mod,f=fake({badOwned:true});await assert.rejects(()=>m.inspectOwnedApi(env(),f.fetcher),/API_IDENTITY_MISMATCH/);
 assert.deepEqual(f.calls.map(x=>x.route),['/healthz']);
});
test('rejects weakened readiness policy before creating users',async()=>{
 const m=await mod,f=fake({badReady:true});const report=await m.acceptance(env(),f.fetcher);
 assert.equal(report.status,'BLOCKED');assert.equal(report.syntheticTestDataCreated,false);
 assert.deepEqual(f.calls.map(x=>x.route),['/healthz','/readyz']);
});
test('authenticated integration journey verifies platform/tenant/member boundaries and session revocation',async()=>{
 const m=await mod,f=fake();const report=await m.acceptance(env(),f.fetcher,{random:()=> '0123456789abcdef'});
 assert.equal(report.status,'AUTHENTICATED_ACCEPTANCE_PASSED_RELEASE_BLOCKED',JSON.stringify(report));
 assert.equal(report.liveAuthenticatedFlowPassed,true);
 assert.equal(report.productionApproved,false);
 assert.equal(report.checks.length,11);
 assert.equal(report.syntheticTestDataCreated,true);
 assert.equal(f.calls.filter(x=>x.route==='/auth/register').length,2);
 assert.ok(f.calls.find(x=>x.route==='/auth/logout'));
 assert.ok(f.calls.find(x=>x.route==='/admin-control/changes'));
 assert.ok(f.calls.find(x=>x.route==='/team/co-admin/invitations'));
 for(const call of f.calls)assert.equal(new URL(call.url).hostname,'127.0.0.1');
});
test('unexpected platform authorization fails closed even if all earlier steps pass',async()=>{
 const m=await mod,f=fake({denyPlatform:true});const report=await m.acceptance(env(),f.fetcher,{random:()=> '0123456789abcdef'});
 assert.equal(report.status,'FAILED');assert.equal(report.liveAuthenticatedFlowPassed,false);
 assert.equal(report.syntheticTestDataCreated,true);
});
test('a token still valid after logout fails revocation verification',async()=>{
 const m=await mod,f=fake({badLogout:true});const report=await m.acceptance(env(),f.fetcher,{random:()=> '0123456789abcdef'});
 assert.equal(report.status,'FAILED');assert.equal(report.liveAuthenticatedFlowPassed,false);
});
test('rejects insecure test nonce before creating synthetic accounts',async()=>{
 const m=await mod,f=fake();const report=await m.acceptance(env(),f.fetcher,{random:()=> 'invalid value'});
 assert.equal(report.status,'FAILED');assert.equal(report.syntheticTestDataCreated,false);assert.equal(f.calls.length,2);
});
test('bad HTTP JSON and transport failure never authorize test mutations',async()=>{
 const m=await mod;
 const response=async()=>({status:200,ok:true,headers:{get:()=>null},text:async()=>'<not-json>'});
 const f=await m.acceptance(env(),response);assert.equal(f.syntheticTestDataCreated,false);
 assert.equal(f.status,'BLOCKED');
 const g=await m.acceptance(env(),async()=>{throw Error('sensitive mysql password')});
 assert.equal(g.status,'BLOCKED');assert.equal(JSON.stringify(g).includes('sensitive mysql password'),false);
});
test('no credentials, access tokens, invite tokens, or account identifiers in pass report',async()=>{
 const m=await mod,f=fake();const report=await m.acceptance(env(),f.fetcher,{random:()=> '0123456789abcdef'});
 const output=JSON.stringify(report);
 for(const x of ['token-admin-A','token-reviewer','test-invite-secret','@test.invalid','0123456789abcdef','operator_password','runtime_password',MARK])
  assert.equal(output.includes(x),false);
});
test('private report writing uses 0600 and never follows symlink destination',async()=>{
 const m=await mod;const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'at-v69-'));
 try{
  const rel=m.saveReport({status:'BLOCKED',productionApproved:false},tmp);
  const file=path.join(tmp,rel);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  fs.rmSync(file);fs.symlinkSync('/etc/passwd',file);
  assert.throws(()=>m.saveReport({status:'PASSED'},tmp),/UNSAFE_EVIDENCE_DESTINATION/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('rejects symlinked test-evidence directory',async()=>{
 const m=await mod,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'at-v69-'));
 try{fs.symlinkSync('/tmp',path.join(tmp,'test-evidence'));
  assert.throws(()=>m.saveReport({status:'BLOCKED'},tmp),/UNSAFE_EVIDENCE_DIRECTORY/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('plan identifies mutations and does not claim release or live browser verification',async()=>{
 const m=await mod;const p=m.plan();assert.equal(p.productionApproved,false);
 assert.ok(p.caution.includes('WRITES'));assert.ok(p.steps.some(x=>x.includes('revoke')));
});

test('CI offline tests and owned HTTP integration both include v69 acceptance',()=>{
 const yml=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 const runner=fs.readFileSync(path.join(ROOT,'tools/ci-live-integration.mjs'),'utf8');
 assert.match(yml,/npm run verify:v69/);
 assert.match(runner,/test:e2e:auth-control:v69/);
 assert.match(runner,/ASSETTRUST_V69_AUTH_CONFIRM:'YES'/);
 assert.match(runner,/setTimeout\(resolve,65000\)/);
 assert.match(runner,/prepareIsolatedRunEnvironment/);
});
test('unexpected HTTP failures report fixed codes, never response content or resource identifiers',async()=>{
 const m=await mod;const f=fake();
 const broken=async (url,opts)=> {
  if(new URL(url).pathname.endsWith('/auth/register'))return respond(409,{privateEmail:'name@test.invalid',password:'raw secret'});
  return f.fetcher(url,opts);
 };
 const result=await m.acceptance(env(),broken,{random:()=> '0123456789abcdef'});
 assert.equal(result.status,'FAILED');
 assert.deepEqual(result.issues,['HTTP_STATUS_MISMATCH']);
 assert.equal(JSON.stringify(result).includes('name@test.invalid'),false);
});
test('attempting to run with unauthorized environment never starts an API request',async()=>{
 const m=await mod;let called=false;
 const result=await m.acceptance(env({NODE_ENV:'production'}),async()=>{called=true;return respond(200,{});});
 assert.equal(called,false);assert.equal(result.syntheticTestDataCreated,false);assert.equal(result.productionApproved,false);
});
