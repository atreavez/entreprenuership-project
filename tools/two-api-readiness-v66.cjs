'use strict';
/**
 * AssetTrust v0.66: read-only HTTP acceptance gate for TWO independently
 * started local test API instances. Never launches a server, modifies a DB,
 * follows redirects, supplies credentials, or approves production release.
 *
 * ASSETTRUST_V66_HTTP_PORTS=4000,4001
 * ASSETTRUST_V66_EXPECT_TARGETS=first-random-marker,second-random-marker
 * CI=true NODE_ENV=test ASSETTRUST_V66_HTTP_CONFIRM=YES
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const REPORT=path.join(ROOT,'test-evidence/v66/two-api-readiness.json');
function parsePorts(value){
 const entries=String(value||'').split(',');
 if(entries.length!==2||entries.some(x=>!/^\d{4,5}$/.test(x)))throw Error('INVALID_PORTS');
 const nums=entries.map(Number);
 if(nums.some(x=>x<1024||x>65535)||nums[0]===nums[1])throw Error('INVALID_PORTS');
 return nums;
}
function parseMarkers(value){
 const entries=String(value||'').split(',');
 if(entries.length!==2||entries.some(x=>!/^[-a-zA-Z0-9_]{16,120}$/.test(x))||entries[0]===entries[1])throw Error('INVALID_TARGET_MARKERS');
 return entries;
}
function validate(env){
 if(env.CI!=='true'||env.NODE_ENV!=='test'||env.ASSETTRUST_V66_HTTP_CONFIRM!=='YES')throw Error('NOT_AUTHORIZED_FOR_LOCAL_TEST');
 const ports=parsePorts(env.ASSETTRUST_V66_HTTP_PORTS);
 const markers=parseMarkers(env.ASSETTRUST_V66_EXPECT_TARGETS);
 // Avoid accidental proxy interception of a local plain HTTP request.
 if(env.HTTP_PROXY||env.HTTPS_PROXY||env.ALL_PROXY){
  // Node's global fetch normally ignores these, but verification should be
  // deterministic under explicit proxy configuration.
  throw Error('PROXY_ENV_NOT_ALLOWED');
 }
 return {ports,markers};
}
function expected(){
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
 const migrations=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/platform/domain/schema-manifest.ts'),'utf8');
 const policies=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts'),'utf8');
 const files=[...migrations.matchAll(/filename:\s*'[^']+',\s*sha256:\s*'[a-f\d]{64}'/g)];
 const names=[...policies.matchAll(/\{table:'([^']+)',name:'([^']+)',cmd:/g)];
 if(!/^0\.\d+\.\d+$/.test(pkg.version)||files.length<1||names.length<1||new Set(names.map(x=>x[1]+x[2])).size!==names.length)throw Error('INVALID_LOCAL_CONTRACT');
 return {version:pkg.version,migrations:files.length,policies:names.length,tables:new Set(names.map(x=>x[1])).size};
}
async function readJson(origin,endpoint,fetcher){
 const response=await fetcher(origin+'/api/v1/'+endpoint,{
  method:'GET',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)
 });
 if(!response.ok)throw Error('HTTP_'+endpoint.toUpperCase()+'_REJECTED');
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>4096)throw Error('RESPONSE_TOO_LARGE');
 const raw=await response.text();
 if(Buffer.byteLength(raw,'utf8')>4096)throw Error('RESPONSE_TOO_LARGE');
 try{return JSON.parse(raw);}catch{throw Error('INVALID_JSON');}
}
async function check(env=process.env,fetcher=globalThis.fetch){
 const {ports,markers}=validate(env);
 const contract=expected();
 const result={schema:'ASSETTRUST_V66_TWO_API_READINESS',status:'FAILED',version:contract.version,
  productionApproved:false,livePostgresTestsVerified:false,instances:[],issues:[],
  notVerified:['Real PostgreSQL credentials/roles independent of server responses','Actual RLS negative CRUD cases','Authenticated browser journeys','TLS, backup restore, original Git history and release security']};
 for(let index=0;index<2;index++){
  const origin=`http://127.0.0.1:${ports[index]}`;
  const item={instance:index+1,port:ports[index],owned:false,ready:false};
  result.instances.push(item);
  try{
   const health=await readJson(origin,'healthz',fetcher);
   if(health?.ok!==true||health.version!==contract.version||health.e2eTargetId!==markers[index])throw Error('TARGET_IDENTITY_MISMATCH');
   item.owned=true;
   const status=await readJson(origin,'readyz',fetcher);
   if(status?.ok!==true||status.version!==contract.version||
      status.database!=='ready'||status.postgis!=='ready'||
      status.schema!=='verified-migration-ledger'||status.security!=='rls-policy-contract-verified'||
      status.migrationsVerified!==contract.migrations||status.rlsPoliciesVerified!==contract.policies||
      status.protectedTablesVerified!==contract.tables)throw Error('READINESS_CONTRACT_MISMATCH');
   item.ready=true;
  }catch(error){
   // Only fixed diagnostic codes; neither origin responses nor errors are printed.
   const code=['HTTP_HEALTHZ_REJECTED','HTTP_READYZ_REJECTED','RESPONSE_TOO_LARGE','INVALID_JSON','TARGET_IDENTITY_MISMATCH','READINESS_CONTRACT_MISMATCH'].includes(error?.message)?error.message:'CONNECTION_OR_TIMEOUT';
   result.issues.push(`API_${index+1}_${code}`);
  }
 }
 result.status=result.issues.length?'FAILED':'LOCAL_READINESS_PASSED_RELEASE_BLOCKED';
 return result;
}
function plan(){return {schema:'ASSETTRUST_V66_TWO_API_PLAN',productionApproved:false,mode:'read-only local test',
  requirements:['Build and start TWO independently marked NestJS API processes against approved disposable loopback PostgreSQL','Run with CI=true NODE_ENV=test ASSETTRUST_V66_HTTP_CONFIRM=YES','Provide two different localhost ports and two different API-owned markers'],
  scope:'Read-only /healthz and /readyz against 127.0.0.1. No redirects, credentials, database writes or browser claims.'};}
function safeDir(dir){
 const stat=fs.lstatSync(dir,{throwIfNoEntry:false});
 if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw Error('UNSAFE_EVIDENCE_DIRECTORY');
 if(!stat)fs.mkdirSync(dir,{mode:0o700});
}
function writeEvidence(report){
 safeDir(path.join(ROOT,'test-evidence'));
 safeDir(path.join(ROOT,'test-evidence/v66'));
 const stat=fs.lstatSync(REPORT,{throwIfNoEntry:false});
 if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('UNSAFE_EVIDENCE_FILE');
 const temp=path.join(path.dirname(REPORT),'.temp-'+crypto.randomBytes(12).toString('hex'));
 const fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{
  const now=fs.lstatSync(REPORT,{throwIfNoEntry:false});
  if(now&&(!now.isFile()||now.isSymbolicLink()))throw Error('UNSAFE_EVIDENCE_FILE');
  fs.renameSync(temp,REPORT);fs.chmodSync(REPORT,0o600);
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return 'test-evidence/v66/two-api-readiness.json';
}
async function main(args=process.argv.slice(2)){
 try{
  if(args.length!==1||!['--plan','--check'].includes(args[0]))throw Error('UNKNOWN_COMMAND');
  if(args[0]==='--plan'){console.log(JSON.stringify(plan(),null,2));return;}
  const result=await check();writeEvidence(result);
  console.log(JSON.stringify(result,null,2));
  if(result.status==='FAILED')process.exitCode=1;
 }catch(error){console.error('BLOCKED v0.66: '+(['NOT_AUTHORIZED_FOR_LOCAL_TEST','INVALID_PORTS','INVALID_TARGET_MARKERS','PROXY_ENV_NOT_ALLOWED','INVALID_LOCAL_CONTRACT','UNSAFE_EVIDENCE_DIRECTORY','UNSAFE_EVIDENCE_FILE','UNKNOWN_COMMAND'].includes(error?.message)?error.message:'VALIDATION_UNAVAILABLE'));process.exitCode=1;}
}
if(require.main===module)void main();
module.exports={parsePorts,parseMarkers,validate,expected,readJson,check,plan,writeEvidence,main};
