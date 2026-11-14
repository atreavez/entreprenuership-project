'use strict';
/**
 * AssetTrust v0.68 — supervised, build-only, evidence-producing acceptance gate.
 * --plan / --inspect / --verify-artifacts are read-only.
 * --run installs from a reviewed lockfile and executes npm scripts ONLY after
 * explicit opt-in on a trusted NON-PRODUCTION build host. Never touches a DB.
 * No command in this module grants production release approval.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {check: checkLock} = require('./lockfile-bootstrap-v55.cjs');
const {inspectSource,inspectBuild,regular} = require('./build-artifact-gate-v56.cjs');
const {sourceMigrations,versionConsistency} = require('./runtime-diagnostics-v65.cjs');
const {safeExcerpt} = require('./integration-evidence-v64.cjs');
const ROOT=path.resolve(__dirname,'..');
const EVIDENCE='test-evidence/v68/build-acceptance.json';
const BUILD_FILES=['apps/api/dist/main.js','apps/web/dist/index.html'];
const PROTECTED_SOURCE_PATHS=Object.freeze([
 'package.json','apps/api/package.json','apps/web/package.json',
 'apps/api/src','apps/api/sql','apps/api/tsconfig.json',
 'apps/web/src','apps/web/public','apps/web/index.html','apps/web/vite.config.ts','apps/web/tsconfig.json',
 'tools','services','deploy','.github/workflows/ci.yml'
]);
/** Fingerprint the actual reviewed source, not just the root npm manifest.
 * A dependency postinstall script must not rewrite application source or SQL
 * and then obtain a successful-looking build attestation. Never hash secrets,
 * private .env files, build outputs, or node_modules into this proof. */
function sourceSnapshot(root=ROOT){
 const entries=[];
 function visit(rel){
  const abs=path.join(root,rel);
  let st;try{st=fs.lstatSync(abs);}catch(e){
   if(e.code==='ENOENT')return;throw e;
  }
  if(st.isSymbolicLink())throw Error('PROTECTED_SOURCE_SYMLINK:'+rel);
  if(st.isDirectory()){
   for(const child of fs.readdirSync(abs).sort())visit(path.posix.join(rel,child));
   return;
  }
  if(!st.isFile())throw Error('PROTECTED_SOURCE_NONREGULAR:'+rel);
  entries.push([rel,sha(abs)]);
 }
 for(const rel of PROTECTED_SOURCE_PATHS)visit(rel);
 entries.sort((a,b)=>a[0].localeCompare(b[0]));
 if(!entries.some(([rel])=>rel==='package.json')||!entries.some(([rel])=>rel==='apps/api/package.json')||!entries.some(([rel])=>rel==='apps/web/package.json'))
  throw Error('PROTECTED_SOURCE_MANIFEST_MISSING');
 const hash=crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
 return {sha256:hash,files:entries.length,entries};
}

/** Hash every emitted runtime file, not just API main.js and the web HTML.
 * The later Kali acceptance supervisor must match this proof to the actual
 * filesystem after `npm ci`, compilation, and every policy check. */
function compiledOutputSnapshot(root=ROOT){
 const entries=[];
 function visit(rel){
  const absolute=path.join(root,rel);
  const st=fs.lstatSync(absolute);
  if(st.isSymbolicLink())throw Error('COMPILED_OUTPUT_SYMLINK:'+rel);
  if(st.isDirectory()){
   for(const child of fs.readdirSync(absolute).sort())visit(path.posix.join(rel,child));
   return;
  }
  if(!st.isFile())throw Error('COMPILED_OUTPUT_NONREGULAR:'+rel);
  if(st.size>128*1024*1024)throw Error('COMPILED_OUTPUT_FILE_OVERSIZED:'+rel);
  entries.push([rel,sha(absolute)]);
 }
 for(const rel of ['apps/api/dist','apps/web/dist'])visit(rel);
 for(const required of BUILD_FILES)if(!entries.some(([rel])=>rel===required))throw Error('COMPILED_OUTPUT_ENTRY_MISSING:'+required);
 entries.sort((a,b)=>a[0].localeCompare(b[0]));
 return {sha256:crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex'),files:entries.length,entries};
}

const STEPS=Object.freeze([
 {id:'lockfile',command:'npm',args:['run','lockfile:check:v55']},
 {id:'install',command:'npm',args:['ci']},
 {id:'dependency-audit',command:'npm',args:['audit','--omit=dev','--audit-level=high']},
 {id:'compile',command:'npm',args:['run','build']},
 {id:'artifact-policy',command:'npm',args:['run','build:artifacts:v56']},
 {id:'milestone-regression',command:'npm',args:['run','verify:v68']}
]);
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function milestoneStep(root){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const m=/^0\.(\d+)\.0$/.exec(pkg.version||'');
 if(!m)throw Error('INVALID_PACKAGE_VERSION');
 const minor=Number(m[1]);if(minor<72)return null;
 const cmd='verify:v'+String(minor).padStart(2,'0');
 if(typeof pkg.scripts?.[cmd]!=='string')throw Error('CURRENT_MILESTONE_REGRESSION_SCRIPT_REQUIRED');
 return {id:'current-milestone-regression',command:'npm',args:['run',cmd]};
}
function versionParts(s){const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(s||''));return m?m.slice(1).map(Number):null;}
function nodeSupported(nodeVersion=process.versions.node){const n=versionParts(nodeVersion);return !!n&&(n[0]>22||(n[0]===22&&n[1]>=12));}
function detect(root=ROOT,{lockCheck=checkLock,sourceCheck=inspectSource,migrationCheck=sourceMigrations,nodeVersion=process.versions.node}={}){
 const issues=[];
 const v=versionConsistency(root);
 if(!v.consistent||!versionParts(v.version))issues.push('PACKAGE_VERSION_INCONSISTENT');
 if(!nodeSupported(nodeVersion))issues.push('NODE_VERSION_UNSUPPORTED');
 if(v.consistent&&versionParts(v.version)?.[1]>=72){try{milestoneStep(root);}catch{issues.push('CURRENT_MILESTONE_REGRESSION_SCRIPT_REQUIRED');}}
 const migration=migrationCheck(root);
 if(!migration.hashesMatch||migration.sourceCount!==27||migration.manifestCount!==27)issues.push('SOURCE_MIGRATIONS_UNVERIFIED');
 const source=sourceCheck(root);
 if(!source.ok)issues.push('SOURCE_ENTRY_OR_IMPORTS_INVALID');
 const lockPresent=regular(path.join(root,'package-lock.json'));
 let lockOk=false;
 if(lockPresent){try{lockOk=lockCheck(root).ok===true;}catch{lockOk=false;}}
 if(!lockOk)issues.push('AUTHENTIC_REVIEWED_LOCKFILE_REQUIRED');
 const git=fs.existsSync(path.join(root,'.git'));
 return {schema:'ASSETTRUST_V68_BUILD_PRECONDITIONS',version:v.version,
  ok:issues.length===0,productionApproved:false,
  checks:{versionConsistent:v.consistent,nodeSupported:nodeSupported(nodeVersion),
   sqlMigrationsVerified:migration.hashesMatch&&migration.sourceCount===27&&migration.manifestCount===27,
   sourceImportPreflightPassed:source.ok,reviewedLockfileValid:lockOk,originalGitHistoryAvailable:git},issues,
  notes:'Original repository history and separate live PostgreSQL/HTTP/security testing remain mandatory for release.'};
}
function artifacts(root=ROOT,{artifactCheck=inspectBuild}={}){
 const gate=artifactCheck(root);
 const issues=[];
 if(!gate.ok)issues.push('COMPILED_ARTIFACT_POLICY_FAILED');
 const entries={};
 for(const rel of BUILD_FILES){
  const file=path.join(root,rel);
  if(!regular(file)){issues.push('COMPILED_ARTIFACT_MISSING:'+rel);continue;}
  const stat=fs.lstatSync(file);
  if(stat.size===0){issues.push('EMPTY_ARTIFACT:'+rel);continue;}
  entries[rel]={sha256:sha(file),bytes:stat.size,modifiedAtMs:stat.mtimeMs};
 }
 return {ok:issues.length===0,productionApproved:false,issues,entries,webPolicyFilesChecked:gate.filesChecked||0};
}
function verifyArtifacts(root=ROOT,opts={}){
 const prerequisites=detect(root,opts),build=artifacts(root,opts);
 return {schema:'ASSETTRUST_V68_COMPILED_ARTIFACT_INSPECTION',version:prerequisites.version,
  ok:prerequisites.ok&&build.ok,productionApproved:false,prerequisites,build,
  notes:'Static inspection of existing build files is not evidence that npm ci/build ran in this session.'};
}
function redacted(text,env){
 // Retain only a short excerpt inside an owner-only evidence file; never print
 // command stdout/stderr or any env values on the terminal.
 return safeExcerpt(String(text||''),env).slice(-1200);
}
function isolatedBuildEnv(env){
 // Dependency install scripts and compilers do not need production secrets.
 // Purge known credential variables, not only their values in log output.
 const denied=/(?:SECRET|PASSWORD|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL|CREDENTIAL|PEPPER|ENCRYPTION|SESSION[_-]?KEY|SIGNING[_-]?KEY|COOKIE[_-]?KEY|AUTH|ACCESS[_-]?KEY|^AWS_|^AZURE_|^GCP_|^GOOGLE_|^GITHUB_|^GH_|^DOCKER_)/i;
 const copy={};
 for(const [key,value] of Object.entries(env))if(!denied.test(key)&&key!=='ASSETTRUST_V68_BUILD_CONFIRM')copy[key]=value;
 return copy;
}
function runAcceptance({root=ROOT,env=process.env,runner=spawnSync,clock=Date.now,detectFn=detect,artifactsFn=artifacts}={}){
 if(env.NODE_ENV==='production'||env.ASSETTRUST_V68_BUILD_CONFIRM!=='YES')
  throw Error('Build acceptance requires non-production host and ASSETTRUST_V68_BUILD_CONFIRM=YES');
 const pre=detectFn(root);
 const result={schema:'ASSETTRUST_V68_SUPERVISED_BUILD',version:pre.version,
  status:'BLOCKED',productionApproved:false,databaseTested:false,
  sourceManifestSha256:regular(path.join(root,'package.json'))?sha(path.join(root,'package.json')):null,
  lockfileSha256:regular(path.join(root,'package-lock.json'))?sha(path.join(root,'package-lock.json')):null,
  prerequisites:pre,steps:[],issues:[],releaseBlockers:[
   'Live restricted-role PostgreSQL/PostGIS integration is not proven by a build',
   'Authentication, browser workflows, backup/restore, independent security testing and deployment remain unverified'
  ]};
 if(!pre.ok){result.issues.push('BUILD_PRECONDITIONS_FAILED');return result;}
 let originalSource;
 try{originalSource=sourceSnapshot(root);}catch(error){
  result.issues.push('SOURCE_SNAPSHOT_FAILED');result.snapshotFailureCode=String(error.message).split(':')[0];return result;
 }
 result.sourceSnapshotSha256=originalSource.sha256;
 result.sourceSnapshotFileCount=originalSource.files;
 const childEnv=isolatedBuildEnv(env);
 let compileStarted=0;
 for(const step of [...STEPS,...(milestoneStep(root)?[milestoneStep(root)]:[])]){
  const began=clock();
  if(step.id==='compile')compileStarted=began;
  let child;
  try{child=runner(step.command,step.args,{cwd:root,env:childEnv,encoding:'utf8',
   stdio:['ignore','pipe','pipe'],shell:false,timeout:30*60*1000,maxBuffer:8*1024*1024});}
  catch(e){child={status:null,error:e,stderr:'',stdout:''};}
  const passed=child.status===0&&!child.error&&!child.signal;
  result.steps.push({id:step.id,command:[step.command,...step.args].join(' '),passed,
   exitCode:Number.isInteger(child.status)?child.status:null,durationMs:Math.max(0,clock()-began)});
  if(!passed){result.status='FAILED';result.issues.push('COMMAND_FAILED:'+step.id);
   result.firstFailure={step:step.id,command:[step.command,...step.args].join(' '),
    redactedExcerpt:redacted([child.stderr,child.stdout,child.error?.message].filter(Boolean).join('\n'),env)};
   return result;
  }
  // An npm lifecycle script must never silently rewrite the reviewed
  // manifests or lockfile while an acceptance run is being recorded.
  if(!regular(path.join(root,'package.json'))||sha(path.join(root,'package.json'))!==result.sourceManifestSha256||
     !regular(path.join(root,'package-lock.json'))||sha(path.join(root,'package-lock.json'))!==result.lockfileSha256){
   result.status='FAILED';result.issues.push('SOURCE_MANIFEST_OR_LOCKFILE_CHANGED:'+step.id);return result;
  }
  // Lockfile-only checks miss an installer that silently edits a TS file,
  // migration, or workspace manifest. Capture the source hash in memory before
  // spawning the very first npm command and recheck after EVERY step.
  let currentSource;
  try{currentSource=sourceSnapshot(root);}catch(error){
   result.status='FAILED';result.issues.push('PROTECTED_SOURCE_INVALID:'+step.id);
   result.snapshotFailureCode=String(error.message).split(':')[0];return result;
  }
  if(currentSource.sha256!==originalSource.sha256){
   result.status='FAILED';result.issues.push('PROTECTED_SOURCE_CHANGED:'+step.id);return result;
  }
  if(step.id==='compile'){
   const built=artifactsFn(root);
   if(!built.ok){result.status='FAILED';result.issues.push('POST_COMPILE_ARTIFACT_POLICY_FAILED');return result;}
   // A previously generated file cannot silently satisfy this build. A 1s
   // allowance handles filesystem timestamp precision on some Linux volumes.
   if(BUILD_FILES.some(rel=>(built.entries[rel]?.modifiedAtMs??0)<compileStarted-1000)){
    result.status='FAILED';result.issues.push('STALE_ARTIFACT_AFTER_COMPILE');return result;
   }
  }
 }
 result.artifacts=artifactsFn(root);
 if(!result.artifacts.ok){result.status='FAILED';result.issues.push('FINAL_BUILD_ARTIFACT_POLICY_FAILED');return result;}
 // v0.86+: retain a complete, content-addressed compiled-output fingerprint.
 // The downstream disposable Kali acceptance supervisor independently rehashes
 // every emitted API and web file instead of trusting the build step exit code.
 if(Number(String(pre.version).split('.')[1])>=86){
  try{
   const output=compiledOutputSnapshot(root);
   result.compiledOutputSnapshotSha256=output.sha256;
   result.compiledOutputSnapshotFileCount=output.files;
  }catch(error){
   result.status='FAILED';result.issues.push('COMPILED_OUTPUT_SNAPSHOT_FAILED');
   result.outputFailureCode=String(error.message).split(':')[0];return result;
  }
 }
 result.status='BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED';
 return result;
}
function safeDirectory(p){try{const s=fs.lstatSync(p);return s.isDirectory()&&!s.isSymbolicLink();}catch{return false;}}
function writeEvidence(root,result){
 for(const dir of [path.join(root,'test-evidence'),path.join(root,'test-evidence','v68')]){
  if(fs.existsSync(dir)&&!safeDirectory(dir))throw Error('Unsafe evidence directory');
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});
 }
 const target=path.join(root,EVIDENCE);
 if(fs.existsSync(target)&&!regular(target))throw Error('Unsafe evidence target');
 const tmp=path.join(path.dirname(target),'.acceptance-'+crypto.randomBytes(16).toString('hex'));
 const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(result,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{
  if(fs.existsSync(target)&&!regular(target))throw Error('Unsafe evidence target');
  fs.renameSync(tmp,target);fs.chmodSync(target,0o600);
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 return EVIDENCE;
}
function plan(){return {schema:'ASSETTRUST_V68_BUILD_PLAN',productionApproved:false,
  steps:STEPS.map(s=>({name:s.id,command:[s.command,...s.args].join(' ')})),
  prerequisites:'Generate/review authentic npm lockfile on trusted connected Kali, then opt in with ASSETTRUST_V68_BUILD_CONFIRM=YES (never NODE_ENV=production).',
  sideEffects:'--run executes npm ci and compilation, but never connects to PostgreSQL or starts the application.',
  release:'Not a production deployment approval.'};}
function main(argv=process.argv.slice(2)){
 try{
  if(argv.length!==1||!['--plan','--inspect','--verify-artifacts','--run'].includes(argv[0]))throw Error('Choose --plan, --inspect, --verify-artifacts, or --run');
  const mode=argv[0];
  const report=mode==='--plan'?plan():mode==='--inspect'?detect():mode==='--verify-artifacts'?verifyArtifacts():runAcceptance();
  if(mode==='--run')writeEvidence(ROOT,report);
  const publicReport={...report};
  if(publicReport.firstFailure)publicReport.firstFailure={...publicReport.firstFailure,redactedExcerpt:'SEE_OWNER_ONLY_LOCAL_EVIDENCE'};
  console.log(JSON.stringify(publicReport,null,2));
  if(mode==='--run'?report.status!=='BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED':mode!=='--plan'&&!report.ok)process.exitCode=1;
 }catch(e){console.error('BLOCKED: '+redacted(e.message,process.env));process.exitCode=1;}
}
if(require.main===module)main();
module.exports={STEPS,PROTECTED_SOURCE_PATHS,sourceSnapshot,compiledOutputSnapshot,milestoneStep,nodeSupported,detect,artifacts,verifyArtifacts,isolatedBuildEnv,runAcceptance,writeEvidence,plan,redacted,main};
