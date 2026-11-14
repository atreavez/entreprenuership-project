'use strict';
/**
 * AssetTrust v0.71: single supervised, fail-closed, disposable Kali acceptance.
 * The v0.70 facilities are reused unchanged; this file sequences their real work
 * and writes private structured evidence without retaining any child output.
 * No result from this tool is a production-release approval.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const v70=require('./local-kali-integration-v70.cjs');
const {isolatedBuildEnv}=require('./build-acceptance-v68.cjs');
const ROOT=path.resolve(__dirname,'..');
const STAGES=Object.freeze([
 {id:'authentic-build',kind:'build'},
 {id:'isolated-postgis',kind:'--start'},
 {id:'local-clamav',kind:'--start-scanner'},
 {id:'migration-and-ledger',kind:'--migrate'},
 {id:'restricted-runtime-role',kind:'--provision'},
 {id:'live-security-verification',kind:'--verify'},
 {id:'authenticated-http-acceptance',kind:'--run-http'}
]);
const ALLOWED_ERROR_CODES=new Set(['ENOENT','EACCES','EPERM','ETIMEDOUT','EIO','ENOTDIR','ENOMEM']);
function authorize(env){
 if(env.ASSETTRUST_V71_ACCEPTANCE_CONFIRM!=='YES'||env.ASSETTRUST_V70_LOCAL_CONFIRM!=='YES'||
    env.NODE_ENV==='production'||env.CI==='false')
  throw Error('V71_EXPLICIT_DISPOSABLE_ACCEPTANCE_AUTHORIZATION_REQUIRED');
}
function safeEvidenceDirectory(dir){
 const st=fs.lstatSync(dir,{throwIfNoEntry:false});
 if(st&&(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0))
  throw Error('UNSAFE_PRIVATE_EVIDENCE_DIRECTORY');
 if(!st)fs.mkdirSync(dir,{mode:0o700});
}
function evidencePath(root=ROOT,random=crypto.randomBytes,clock=Date.now){
 // load checks the full owner-only private configuration before any evidence write.
 const {p}=v70.load({root});
 const dir=path.join(p.dir,'evidence');
 safeEvidenceDirectory(dir);
 const entropy=random(12);
 if(!Buffer.isBuffer(entropy)||entropy.length!==12)throw Error('SECURE_RANDOM_REQUIRED');
 return path.join(dir,'v71-'+Math.floor(clock())+'-'+entropy.toString('hex')+'.json');
}
function writeEvidence(file,result){
 const dir=path.dirname(file);
 safeEvidenceDirectory(dir);
 const st=fs.lstatSync(file,{throwIfNoEntry:false});
 if(st)throw Error('EVIDENCE_ALREADY_EXISTS');
 const bytes=JSON.stringify(result,null,2)+'\n';
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function plan(){return {schema:'ASSETTRUST_V71_ACCEPTANCE_PLAN',mode:'DISPOSABLE_LOCAL_ONLY',
  stages:STAGES.map(s=>s.id),productionApproved:false,status:'NOT_EXECUTED',
  prerequisites:['Prepared v0.70 private fixture','Reviewed authentic npm lockfile','Node.js >=22.12','Local Docker + PostgreSQL/PostGIS + ClamAV','Explicit dual confirmation'],
  continuousBuildIntegrityEnforced:requiresContinuousIntegrity(ROOT),
  note:'Build first; v87+ rechecks source and compiled-output provenance before and after each disposable child command. No production approval.'};}
function inspect({root=ROOT}={}){
 const state=v70.doctor({root});
 const continuous=requiresContinuousIntegrity(root);
 const currentProvenance=continuous?require('./acceptance-provenance-v86.cjs').verify(root):null;
 return {schema:'ASSETTRUST_V71_ACCEPTANCE_INSPECTION',status:'READ_ONLY',productionApproved:false,
  continuousBuildIntegrityEnforced:continuous,compiledProvenanceReady:currentProvenance?.ok===true,
  sourceRecognized:state.sourceRecognized,privateFixtureConfigured:state.preparedConfigurationValid,
  restrictedRolePresent:state.restrictedRuntimeConfigured,
  authenticLockfilePresent:state.genuineLockfilePresent,
  apiArtifactPresent:state.apiBuildPresent,webArtifactPresent:state.webBuildPresent,
  next:'Use the v0.70 setup runbook; then run v0.71 acceptance only with both explicit confirmations.',
  releaseStatus:'NO_GO'};
}
function safeChildResult(child){
 const code=Number.isInteger(child?.status)?child.status:null;
 const errorCode=String(child?.error?.code||'');
 return {exitCode:code,signal:child?.signal?'SIGNALLED':null,
  errorCode:ALLOWED_ERROR_CODES.has(errorCode)?errorCode:null,
  timedOut:errorCode==='ETIMEDOUT',
  passed:code===0&&!child?.error&&!child?.signal};
}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function currentVersion(root){const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(!/^0\.[0-9]+\.0$/.test(pkg.version))throw Error('INVALID_PACKAGE_VERSION');return pkg.version;}
function expectedBuildStages(root){const v=currentVersion(root),minor=Number(v.split('.')[1]);return minor>=72?['lockfile','install','dependency-audit','compile','artifact-policy','milestone-regression','current-milestone-regression']:['lockfile','install','dependency-audit','compile','artifact-policy','milestone-regression'];}
function reviewBuildEvidence(root=ROOT){
 // v0.86 and later need the complete source and compiled-output hashes.
 // Keep the original v71/v72 fixture contract for historical regression tests;
 // a contemporary release cannot fall back to that older, weaker rule.
 if(Number(currentVersion(root).split('.')[1])>=86)
  return require('./acceptance-provenance-v86.cjs').verify(root).ok;
 const expected=expectedBuildStages(root);
 try{
  const entry=path.join(root,'test-evidence/v68/build-acceptance.json');
  const stat=fs.lstatSync(entry);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)return false;
  const evidence=JSON.parse(fs.readFileSync(entry,'utf8'));
  if(evidence.status!=='BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED'||
     evidence.version!==currentVersion(root)||evidence.prerequisites?.ok!==true||
     !Array.isArray(evidence.steps)||evidence.steps.length!==expected.length)return false;
  if(!evidence.steps.every((step,i)=>step.id===expected[i]&&step.passed===true))return false;
  return evidence.sourceManifestSha256===sha256(path.join(root,'package.json'))&&
    evidence.lockfileSha256===sha256(path.join(root,'package-lock.json'));
 }catch{return false;}
}
function requiresContinuousIntegrity(root){
 // Historical v71-v86 fixtures retain their original acceptance contracts.
 // Every v87+ disposable execution MUST recheck provenance around every command.
 return Number(currentVersion(root).split('.')[1])>=87;
}
function buildEnvironment(env){
 // Build subprocesses never inherit DB URLs, private keys or authentication tokens.
 const copy=isolatedBuildEnv(env);
 // Npm lifecycle scripts may be untrusted; never pass live-operation confirmations.
 for(const key of Object.keys(copy))if(/^ASSETTRUST_|^DATABASE_|^DOCUMENT_|^JWT_|^MFA_|^LOGIN_ABUSE_|^GITHUB_/i.test(key))delete copy[key];
 return {...copy,CI:'true',NODE_ENV:'test',ASSETTRUST_V68_BUILD_CONFIRM:'YES'};
}
function execute({root=ROOT,env=process.env,runner=spawnSync,buildRunner=runner,
  v70Run=v70.run,artifactsReady=v70.runtimeArtifactsReady,buildEvidenceReady=reviewBuildEvidence,clock=Date.now,
  evidenceWriter=writeEvidence,makeEvidencePath=evidencePath}={}){
 authorize(env);
 const loaded=v70.load({root});
 const filename=makeEvidencePath(root);
 const started=clock();
 const records=[];
 let status='FAILED';
 let firstFailure=null;
 let activeStage='authentic-build';
 const continuousIntegrity=requiresContinuousIntegrity(root);
 let integrityChecks=0;
 // Never rely solely on the build-stage proof. A long-running accepted deployment
 // can change its local source or compiled outputs between migration, RLS and HTTP.
 function integrityCurrent(){
  if(!continuousIntegrity)return true;
  integrityChecks++;
  try{return artifactsReady(root)===true&&buildEvidenceReady(root)===true;}catch{return false;}
 }
 const drift=()=>({passed:false,exitCode:null,errorCode:'BUILD_INTEGRITY_DRIFT',timedOut:false});
 function record(id,result){
  const evidence={stage:id,passed:result.passed,exitCode:result.exitCode??null,
   errorCode:result.errorCode??null,timedOut:result.timedOut===true,
   completedCommands:result.completedCommands??null};
  records.push(evidence);
  if(!result.passed)firstFailure={stage:id,exitCode:evidence.exitCode,errorCode:evidence.errorCode};
  return result.passed;
 }
 try{
  const build=buildRunner('npm',['run','build:acceptance:run:v68'],{
   cwd:root,env:buildEnvironment(env),encoding:'utf8',stdio:['ignore','pipe','pipe'],shell:false,
   timeout:45*60*1000,maxBuffer:8*1024*1024});
  if(!record(STAGES[0].id,safeChildResult(build)))return {status:'FAILED',stage:STAGES[0].id,evidenceCreated:true,productionApproved:false};
  // A child returning success is not enough; verify the reviewed source & compiled artifacts.
  if(!artifactsReady(root)||!buildEvidenceReady(root)||!integrityCurrent()){
   record('build-artifact-provenance',{passed:false,errorCode:'BUILD_PROVENANCE_OR_EVIDENCE_REJECTED'});
   return {status:'FAILED',stage:'build-artifact-provenance',evidenceCreated:true,productionApproved:false};
  }
  for(const stage of STAGES.slice(1)){
   activeStage=stage.id;
   if(!integrityCurrent()){
    record(stage.id,drift());
    return {status:'FAILED',stage:stage.id,evidenceCreated:true,productionApproved:false};
   }
   // Do not try to rotate an existing disposable login; v0.70 will verify it afresh.
   if(stage.kind==='--provision'&&loaded.env.ASSETTRUST_RUNTIME_DATABASE_URL){
    records.push({stage:stage.id,passed:true,reusedExistingRole:true,completedCommands:0});
    continue;
   }
   let commands=0;
   let failedChild=null;
   const wrappedRunner=(program,args,options)=>{
    // The actual child runner never sees the command if provenance has drifted.
    // Also verify immediately after each child, before the next SQL/API action.
    if(!integrityCurrent()){
     failedChild=drift();
     return {status:1,error:{code:'EACCES'},stdout:'',stderr:''};
    }
    commands++;
    let child;
    try{child=runner(program,args,options)}
    catch(error){child={status:null,error,stdout:'',stderr:''};}
    if(!integrityCurrent()){
     failedChild=drift();
     return {status:1,error:{code:'EACCES'},stdout:'',stderr:''};
    }
    const outcome=safeChildResult(child);
    if(!outcome.passed)failedChild=outcome;
    return child;
   };
   let outcome;
   try{
    outcome=v70Run(stage.kind,{root,env,runner:wrappedRunner,artifactsReady});
   }catch(error){
    outcome={status:'FAILED'};
    failedChild=failedChild||{exitCode:null,errorCode:'V70_GUARD_REJECTED',timedOut:false};
   }
   // Catch changes made by the orchestration layer itself, not just children.
   const finalIntegrity=integrityCurrent();
   if(!finalIntegrity)failedChild=drift();
   const passed=outcome?.status==='COMMANDS_PASSED_RELEASE_BLOCKED'&&!failedChild&&commands>0;
   if(!record(stage.id,{passed,exitCode:failedChild?.exitCode,
    errorCode:failedChild?.errorCode||(passed?null:'V70_STEP_FAILED'),
    timedOut:failedChild?.timedOut,completedCommands:commands}))
    return {status:'FAILED',stage:stage.id,evidenceCreated:true,productionApproved:false};
  }
  status='ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED';
  return {status,completedStages:records.length,evidenceCreated:true,productionApproved:false};
 }catch(error){
  firstFailure={stage:activeStage,errorCode:'SUPERVISOR_ERROR'};
  return {status:'FAILED',stage:activeStage,evidenceCreated:true,productionApproved:false};
 }finally{
  const result={schema:'ASSETTRUST_V71_PRIVATE_ACCEPTANCE_EVIDENCE',version:currentVersion(root),
   startedAt:new Date(started).toISOString(),finishedAt:new Date(clock()).toISOString(),
   status,productionApproved:false,releaseStatus:'NO_GO',
   databaseHost:'127.0.0.1',databaseName:v70.DB,
   steps:records,firstFailure,
   logsIncluded:false,credentialsIncluded:false,
   continuousBuildIntegrityEnforced:continuousIntegrity,integrityChecks,
   note:'Private local test evidence only. Full independent final security gate remains mandatory.'};
  evidenceWriter(filename,result);
 }
}
function main(args=process.argv.slice(2)){
 try{
  if(args.length!==1||!['--plan','--inspect','--run'].includes(args[0]))throw Error('UNRECOGNIZED_V71_ACTION');
  const result=args[0]==='--plan'?plan():args[0]==='--inspect'?inspect():execute();
  console.log(JSON.stringify(result,null,2));
  if(result.status==='FAILED'||result.status==='BLOCKED')process.exitCode=1;
 }catch(error){console.error('BLOCKED: '+String(error.message).replace(/[^A-Z0-9_]/g,'').slice(0,80));process.exitCode=1;}
}
if(require.main===module)main();
module.exports={STAGES,currentVersion,expectedBuildStages,requiresContinuousIntegrity,authorize,evidencePath,writeEvidence,plan,inspect,safeChildResult,reviewBuildEvidence,buildEnvironment,execute};
