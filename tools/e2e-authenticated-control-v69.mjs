/**
 * AssetTrust v0.69: real authenticated HTTP acceptance for the admin control plane.
 * Run against an already SUPERVISED, OWNED local test API and disposable PostgreSQL.
 * Synthetic records are created; never run against production or a shared database.
 * Fail closed and never write access tokens, passwords, invite secrets or raw responses.
 */
import assert from 'node:assert/strict';
import {enrollSyntheticAdminMfa} from './e2e-mfa-onboarding-v82.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls}=require('./runtime-role-policy-v57.cjs');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPORT=path.join(ROOT,'test-evidence/v69/authenticated-control.json');
const VALID_STATUSES=new Set([200,201,400,401,403,404,409]);

export function authorize(env=process.env){
 if(env.CI!=='true'||env.NODE_ENV!=='test'||env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||
    env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES'||env.ASSETTRUST_V69_AUTH_CONFIRM!=='YES')
  throw Error('DISPOSABLE_TEST_CONFIRMATION_REQUIRED');
 const target=validateDisposablePgTarget(env);
 if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('UNAPPROVED_DATABASE_NAME');
 const db=validateRuntimeDatabaseUrls(env.DATABASE_URL,env.ASSETTRUST_RUNTIME_DATABASE_URL);
 if(db.database!==target.databaseName)throw Error('DATABASE_TARGET_MISMATCH');
 const expected=env.ASSETTRUST_E2E_EXPECT_TARGET;
 if(typeof expected!=='string'||expected.length<20||expected.length>128||
  !/^[a-zA-Z0-9_-]+$/.test(expected)||expected!==env.ASSETTRUST_E2E_TARGET_ID)
  throw Error('OWNED_API_MARKER_REQUIRED');
 let url;
 try{url=new URL(env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000');}catch{throw Error('INVALID_LOCAL_API_ORIGIN');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!/^\d{4,5}$/.test(url.port)||
  Number(url.port)<1024||Number(url.port)>65535||url.pathname!=='/'||url.search||url.hash||url.username||url.password)
  throw Error('INVALID_LOCAL_API_ORIGIN');
 return {origin:url.origin,dbName:target.databaseName,expected};
}
function readExpected(){
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
 const schema=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/platform/domain/schema-manifest.ts'),'utf8');
 const policy=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts'),'utf8');
 const migrations=[...schema.matchAll(/filename:\s*'[^']+',\s*sha256:\s*'[a-f\d]{64}'/g)].length;
 const policies=[...policy.matchAll(/\{table:'([^']+)',name:'([^']+)',cmd:/g)];
 if(!/^0\.\d+\.\d+$/.test(manifest.version)||migrations!==27||policies.length!==16)
  throw Error('SOURCE_CONTRACT_UNVERIFIED');
 return {version:manifest.version,migrations,policies:policies.length,tables:new Set(policies.map(x=>x[1])).size};
}
async function jsonRequest(fetcher,origin,endpoint,{method='GET',body,token,expected=200}={}){
 if(!/^\/[a-zA-Z0-9/?=&._-]+$/.test(endpoint)||endpoint.startsWith('//'))throw Error('UNSAFE_ENDPOINT');
 if(!VALID_STATUSES.has(expected))throw Error('INVALID_EXPECTED_STATUS');
 const headers={Accept:'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined)headers['Content-Type']='application/json';
 let response;
 try{response=await fetcher(origin+'/api/v1'+endpoint,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body),redirect:'error',cache:'no-store',
  signal:AbortSignal.timeout(8000)});
 }catch{throw Error('HTTP_TRANSPORT_FAILURE');}
 if(response.status!==expected)throw Error('HTTP_STATUS_MISMATCH');
 const header=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(header)&&header>32768)throw Error('HTTP_BODY_TOO_LARGE');
 const raw=await response.text();
 if(Buffer.byteLength(raw,'utf8')>32768)throw Error('HTTP_BODY_TOO_LARGE');
 if(!raw)return {};
 try{return JSON.parse(raw);}catch{throw Error('HTTP_INVALID_JSON');}
}
export async function inspectOwnedApi(env,fetcher=globalThis.fetch){
 const target=authorize(env),expected=readExpected();
 const health=await jsonRequest(fetcher,target.origin,'/healthz');
 if(health.service!=='assettrust-api'||health.ok!==true||health.version!==expected.version||
    health.e2eTargetId!==target.expected)throw Error('API_IDENTITY_MISMATCH');
 const ready=await jsonRequest(fetcher,target.origin,'/readyz');
 if(ready.ok!==true||ready.version!==expected.version||ready.database!=='ready'||ready.postgis!=='ready'||
   ready.schema!=='verified-migration-ledger'||ready.security!=='rls-policy-contract-verified'||
   ready.migrationsVerified!==expected.migrations||ready.rlsPoliciesVerified!==expected.policies||
   ready.protectedTablesVerified!==expected.tables)throw Error('API_READINESS_UNVERIFIED');
 return {origin:target.origin,version:expected.version,dbName:target.dbName};
}
export async function acceptance(env=process.env,fetcher=globalThis.fetch,{random=()=>randomBytes(12).toString('hex')}={}){
 const report={schema:'ASSETTRUST_V69_AUTHENTICATED_CONTROL',version:readExpected().version,
  status:'BLOCKED',productionApproved:false,liveAuthenticatedFlowPassed:false,
  checks:[],issues:[],syntheticTestDataCreated:false,
  limits:['No independent browser/UI rendering acceptance','No live PostGIS geospatial claims from this suite',
   'No production security certification','Synthetic test organizations must be removed by disposable DB teardown']};
 const pass=x=>report.checks.push(x);
 try{
  const target=await inspectOwnedApi(env,fetcher);
  report.status='FAILED';pass('owned-api-and-rls-readiness');
  const seed=random();
  if(!/^[a-z0-9]{12,32}$/.test(seed))throw Error('UNSAFE_TEST_NONCE');
  const password='Atv69!'+randomBytes(24).toString('base64url')+'7a';
  const admin1Email=`v69-a-${seed}@test.invalid`,admin2Email=`v69-b-${seed}@test.invalid`;
  const reviewerEmail=`v69-review-${seed}@test.invalid`;
  const request=(route,opt)=>jsonRequest(fetcher,target.origin,route,opt);
  // Successful registrations are real DB mutations. All data is test.invalid synthetic.
  const a=await request('/auth/register',{method:'POST',expected:201,
   body:{fullName:'Synthetic V69 Administrator A',organization:'Synthetic V69 Org A '+seed,email:admin1Email,password}});
  report.syntheticTestDataCreated=true;
  const b=await request('/auth/register',{method:'POST',expected:201,
   body:{fullName:'Synthetic V69 Administrator B',organization:'Synthetic V69 Org B '+seed,email:admin2Email,password}});
  assert.ok(typeof a.accessToken==='string'&&a.accessToken.length>20);
  assert.ok(typeof b.accessToken==='string'&&b.accessToken.length>20);
  // v0.82: newly registered founders have provisional sessions until MFA is confirmed.
  const sendMfa=(route,token,body)=>request(route,{method:'POST',expected:201,token,body});
  await enrollSyntheticAdminMfa({token:a.accessToken,password,send:sendMfa});
  await enrollSyntheticAdminMfa({token:b.accessToken,password,send:sendMfa});
  pass('two-registered-test-organizations');
  const meA=await request('/auth/me',{token:a.accessToken});
  const meB=await request('/auth/me',{token:b.accessToken});
  assert.notEqual(meA.organizationId,meB.organizationId);
  pass('independent-organization-principals');
  const adminA=await request('/admin-control/me',{token:a.accessToken});
  const adminB=await request('/admin-control/me',{token:b.accessToken});
  assert.equal(adminA.canOrganizationAdmin,true);assert.equal(adminB.canOrganizationAdmin,true);
  assert.equal(adminA.canPlatformAdmin,false);assert.equal(adminB.canPlatformAdmin,false);
  pass('organization-admin-not-platform-admin');
  const catalog=await request('/admin-control/catalog?scope=organization',{token:a.accessToken});
  assert.equal(catalog.scope,'organization');assert.ok(Array.isArray(catalog.items)&&catalog.items.length>0);
  await request('/admin-control/settings?scope=organization',{token:b.accessToken});
  pass('organization-admin-read-only-settings');
  for(const token of [a.accessToken,b.accessToken]){
   await request('/admin-control/organizations',{token,expected:403});
   await request('/admin-control/catalog?scope=platform',{token,expected:403});
  }
  pass('platform-control-rejected-for-both-org-admins');
  const asset=await request('/assets',{method:'POST',expected:201,token:a.accessToken,
   body:{assetType:'LAND',district:'Wakiso',declaredOwner:'Synthetic only - not a legal title',
    parcelReference:'V69-'+seed,description:'Disposable verification workflow evidence'}});
  assert.ok(typeof asset.id==='string'&&asset.id.length>10);
  await request('/assets/'+asset.id,{token:b.accessToken,expected:404});
  const bAssets=await request('/assets',{token:b.accessToken});
  assert.ok(Array.isArray(bAssets)&&!bAssets.some(x=>x.id===asset.id));
  pass('cross-organization-asset-read-and-list-denied');
  const invite=await request('/team/invitations',{method:'POST',expected:201,token:a.accessToken,
   body:{email:reviewerEmail,role:'REVIEWER'}});
  assert.ok(typeof invite.inviteToken==='string'&&invite.inviteToken.length>=12);
  await request('/team/accept',{method:'POST',expected:201,
   body:{token:invite.inviteToken,fullName:'Synthetic V69 Reviewer',password}});
  const reviewer=await request('/auth/login',{method:'POST',expected:201,body:{email:reviewerEmail,password}});
  assert.ok(typeof reviewer.accessToken==='string'&&reviewer.accessToken.length>20);
  pass('invitation-and-authenticated-reviewer-login');
  await request('/admin-control/me',{token:reviewer.accessToken,expected:403});
  await request('/admin-control/catalog?scope=organization',{token:reviewer.accessToken,expected:403});
  await request('/assets/'+asset.id,{token:reviewer.accessToken,expected:403});
  await request('/admin-control/changes',{method:'POST',expected:403,token:reviewer.accessToken,
   body:{scope:'organization',key:'workspace.announcement',value:'Synthetic unapproved change',expectedVersion:0}});
  await request('/team/co-admin/invitations',{method:'POST',expected:403,token:reviewer.accessToken,
   body:{email:`v69-privileged-${seed}@test.invalid`}});
  pass('non-admin-denied-privileged-writes');
  pass('reviewer-denied-admin-and-unassigned-asset');
  await request('/auth/logout',{method:'POST',expected:201,token:reviewer.accessToken,body:{}});
  await request('/auth/me',{token:reviewer.accessToken,expected:401});
  pass('revoked-access-token-is-rejected');
  report.status='AUTHENTICATED_ACCEPTANCE_PASSED_RELEASE_BLOCKED';
  report.liveAuthenticatedFlowPassed=true;
 }catch(error){
  // Static error codes only. Do NOT serialize HTTP JSON, tokens or the random fixture nonce.
  const code=String(error?.message||'UNKNOWN_ERROR');
  report.issues.push(/^[A-Z0-9_]+$/.test(code)?code:'ACCEPTANCE_ASSERTION_FAILED');
  if(report.status==='BLOCKED')report.status='BLOCKED';else report.status='FAILED';
 }
 return report;
}
function safeEvidenceDirectory(dir){
 const stat=fs.lstatSync(dir,{throwIfNoEntry:false});
 if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw Error('UNSAFE_EVIDENCE_DIRECTORY');
 if(!stat)fs.mkdirSync(dir,{mode:0o700});
}
export function saveReport(report,root=ROOT){
 const dir=path.join(root,'test-evidence');safeEvidenceDirectory(dir);
 const folder=path.join(dir,'v69');safeEvidenceDirectory(folder);
 const destination=path.join(folder,'authenticated-control.json');
 const s=fs.lstatSync(destination,{throwIfNoEntry:false});
 if(s&&(!s.isFile()||s.isSymbolicLink()))throw Error('UNSAFE_EVIDENCE_DESTINATION');
 const tmp=path.join(folder,'.tmp-'+randomUUID());
 const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{fs.renameSync(tmp,destination);fs.chmodSync(destination,0o600);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 return 'test-evidence/v69/authenticated-control.json';
}
export function plan(){return {schema:'ASSETTRUST_V69_PLAN',productionApproved:false,
  run:'CI=true NODE_ENV=test ASSETTRUST_V69_AUTH_CONFIRM=YES npm run test:e2e:auth-control:v69',
  target:'supervised API at http://127.0.0.1:<port>; matching unpredictable instance ID; disposable PostgreSQL operator and restricted runtime logins',
  steps:['health and RLS readiness','register two synthetic organizations','verify organization-admin and platform privilege boundaries',
   'reject admin writes without current MFA step-up','create asset and deny cross-tenant access','invite reviewer and reject admin access','revoke reviewer token'],
  caution:'This test WRITES synthetic records. It does not delete a shared DB; dispose of the entire test database after validation.'};}
async function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--plan','--run'].includes(args[0])){console.error('Usage: --plan or --run');process.exitCode=1;return;}
 if(args[0]==='--plan'){console.log(JSON.stringify(plan(),null,2));return;}
 // Abort before touching any API if environment is not explicitly authorized.
 try{authorize();}catch(error){console.error('BLOCKED: '+String(error.message).replace(/[^A-Z0-9_]/g,'').slice(0,64));process.exitCode=1;return;}
 const result=await acceptance();
 try{saveReport(result);}catch{console.error('BLOCKED: COULD_NOT_WRITE_PRIVATE_TEST_EVIDENCE');process.exitCode=1;return;}
 console.log(JSON.stringify(result,null,2));
 if(!result.liveAuthenticatedFlowPassed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
