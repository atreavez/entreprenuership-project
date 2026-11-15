/**
 * v0.42 supervised two-REAL-NestJS-process smoke against the same approved disposable DB.
 * Proves independent ownership/readiness and rejection of unknown share secrets on both.
 * Does NOT claim to prove a concurrent VALID-share redemption race or full browser E2E.
 */
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,openSync,closeSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {prepareIsolatedRunEnvironment,waitForOwnedApiReady} from './ci-runner-policy.mjs';
const require=createRequire(import.meta.url);
const {assertTwoApiEnvironment,recipientProbe,assertDeniedResponse}=require('./two-api-policy-v42.cjs');
const {runtimeDatabaseUrl}=require('./runtime-role-policy-v57.cjs');
const {check:checkV66Readiness}=require('./two-api-readiness-v66.cjs');
// Enforce ALL safety properties before reading compiled app or spawning processes.
const contract=assertTwoApiEnvironment(process.env);
const ROOT=resolve(import.meta.dirname,'..');
if(!existsSync(join(ROOT,'apps/api/dist/main.js')))throw Error('BLOCKED: compile the real API with npm ci && npm run build first');
const directory=mkdtempSync(join(tmpdir(),'assettrust-v42-'));
const instances=[];
let stopped=false;
function stopChild(item){
 if(!item?.child || item.child.exitCode!==null)return;
 try{if(process.platform!=='win32')process.kill(-item.child.pid,'SIGTERM');else item.child.kill('SIGTERM')}catch{}
}
function stopAll(){if(stopped)return;stopped=true;for(const item of instances)stopChild(item);}
process.once('SIGINT',()=>{stopAll();process.exitCode=130;});
process.once('SIGTERM',()=>{stopAll();process.exitCode=143;});
function startInstance(port,label){
 const origin=`http://127.0.0.1:${port}`;
 const prepared=prepareIsolatedRunEnvironment({...process.env,ASSETTRUST_E2E_URL:origin});
 const env={...prepared.env,DATABASE_URL:runtimeDatabaseUrl(prepared.env),PORT:String(port),API_BIND_HOST:'127.0.0.1'};
 const log=join(directory,`${label}.log`);
 const file=openSync(log,'w');
 const child=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:ROOT,env,stdio:['ignore',file,file],detached:process.platform!=='win32'});
 closeSync(file);
 const item={label,child,origin,env,log};instances.push(item);
 return item;
}
function redactedExcerpt(item){
 try{
  let body=readFileSync(item.log,'utf8').split('\n').slice(-20).join('\n').slice(-2800);
  const keys=[process.env.JWT_SECRET,process.env.MFA_ENCRYPTION_KEY,process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL,process.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64];
  try{keys.push(...Object.values(JSON.parse(process.env.DOCUMENT_ENCRYPTION_KEYS||'{}')))}catch{}
  for(const s of keys){if(typeof s==='string'&&s.length>=8)body=body.split(s).join('[REDACTED]')}
  return body;
 }catch{return '(No API log found)'}
}
try{
 const [first,second]=contract.ports.map((port,index)=>startInstance(port,`api-${index+1}`));
 if(first.env.ASSETTRUST_E2E_TARGET_ID===second.env.ASSETTRUST_E2E_TARGET_ID)throw Error('Server identity markers unexpectedly coincide');
 await Promise.all(instances.map(item=>waitForOwnedApiReady(item.origin,item.env,{
   isChildAlive:()=>item.child.exitCode===null&&item.child.signalCode===null&&!item.child.killed,
   attempts:40,intervalMs:1000
 })));
 // v0.66 extends the already-supervised local two-API test with strict,
 // identity-bound, continuously checked 16-policy/13-table readiness. This is
 // READ-ONLY and never substitutes for the existing recipient denial tests.
 let v66Readiness=null;
 if(process.env.ASSETTRUST_V66_HTTP_CONFIRM==='YES'){
  v66Readiness=await checkV66Readiness({...process.env,
   ASSETTRUST_V66_HTTP_PORTS:contract.ports.join(','),
   ASSETTRUST_V66_EXPECT_TARGETS:instances.map(x=>x.env.ASSETTRUST_E2E_TARGET_ID).join(',')});
  if(v66Readiness.status!=='LOCAL_READINESS_PASSED_RELEASE_BLOCKED')
   throw Error('v0.66 two-instance live readiness contract did not pass: '+v66Readiness.issues.join(','));
 }
 const probes=await Promise.all(instances.map(async item=>{
  const request=recipientProbe(item.origin,randomUUID());
  const result=await fetch(request.url,{...request.options,signal:AbortSignal.timeout(8000)});
  assertDeniedResponse(result);
  return {instance:item.label,port:Number(new URL(item.origin).port),rejectedStatus:result.status};
 }));
 console.log(JSON.stringify({schema:'ASSETTRUST_TWO_API_SMOKE_V42',result:'PASS',database:contract.dbName,independentProcesses:2,ownedReadiness:true,unknownRecipientRejections:probes,v66Readiness:v66Readiness?{status:v66Readiness.status,verifiedInstances:v66Readiness.instances.length,productionApproved:false}:null,verified:'two owned API processes share one disposable test DB and reject unknown bearer credentials',notVerified:['cross-instance valid-credential redemption race','Playwright/browser user journeys','production deployment']},null,2));
}catch(error){
 console.error('FAIL v0.42 two-server contract: '+error.message);
 for(const item of instances)console.error(`${item.label} (redacted):\n${redactedExcerpt(item)}`);
 process.exitCode=1;
}finally{
 stopAll();
 await Promise.all(instances.map(item=>new Promise(resolve=>{
  if(item.child.exitCode!==null||item.child.signalCode!==null)return resolve();
  item.child.once('close',resolve);
  setTimeout(()=>{try{if(process.platform!=='win32')process.kill(-item.child.pid,'SIGKILL');else item.child.kill('SIGKILL')}catch{}resolve();},3000).unref();
 })));
 rmSync(directory,{recursive:true,force:true});
}
