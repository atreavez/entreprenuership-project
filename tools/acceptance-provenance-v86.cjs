'use strict';
/** v0.86 build-to-live acceptance integrity gate (read-only).
 * Verifies an earlier supervised build's exact sources, lockfile, ordered
 * command results and complete emitted API/web files. This is NOT an
 * independent signature, proof of compilation, or production approval.
 * There is no network, database, shell execution, or secret output here.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const build=require('./build-acceptance-v68.cjs');
const ROOT=path.resolve(__dirname,'..');
const EVIDENCE='test-evidence/v68/build-acceptance.json';
const EXPECTED_STEPS=Object.freeze(['lockfile','install','dependency-audit','compile','artifact-policy','milestone-regression','current-milestone-regression']);
const HASH=/^[0-9a-f]{64}$/;
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function regular(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
function verify(root=ROOT){
 const issues=[];
 const add=code=>issues.push(code);
 let version;
 try{
  const names=['package.json','apps/api/package.json','apps/web/package.json'];
  const v=names.map(rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8')).version);
  if(new Set(v).size!==1)throw Error('PACKAGE_VERSION_INCONSISTENT');
  version=v[0];
  if(!/^0\.(?:8[6-9]|9\d|[1-9]\d{2,})\.0$/.test(version))throw Error('V86_VERSION_REQUIRED');
 }catch{return {schema:'ASSETTRUST_V86_BUILD_PROVENANCE',ok:false,issues:['V86_VERSION_OR_WORKSPACE_INVALID'],productionApproved:false};}
 const entry=path.join(root,EVIDENCE);
 let evidence;
 try{
  if(!regular(entry)||fs.statSync(entry).size>1024*1024)throw Error('UNSAFE_BUILD_EVIDENCE');
  evidence=JSON.parse(fs.readFileSync(entry,'utf8'));
 }catch{return {schema:'ASSETTRUST_V86_BUILD_PROVENANCE',version,ok:false,issues:['BUILD_EVIDENCE_MISSING_OR_INVALID'],productionApproved:false};}
 if(evidence.schema!=='ASSETTRUST_V68_SUPERVISED_BUILD'||
    evidence.status!=='BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED'||
    evidence.version!==version||evidence.prerequisites?.ok!==true||
    evidence.productionApproved!==false||evidence.databaseTested!==false)
  add('UNTRUSTED_BUILD_RESULT');
 if(!Array.isArray(evidence.steps)||evidence.steps.length!==EXPECTED_STEPS.length||
   !EXPECTED_STEPS.every((id,i)=>{
    const s=evidence.steps?.[i];return s?.id===id&&s.passed===true&&s.exitCode===0;
   }))add('INCOMPLETE_OR_UNORDERED_BUILD_STEPS');
 try{
  for(const [file,hash] of [['package.json',evidence.sourceManifestSha256],['package-lock.json',evidence.lockfileSha256]]){
   const abs=path.join(root,file);
   if(!HASH.test(String(hash))||!regular(abs)||sha(abs)!==hash)throw Error('MANIFEST_OR_LOCKFILE_MISMATCH');
  }
 }catch{add('MANIFEST_OR_LOCKFILE_MISMATCH');}
 try{
  const current=build.sourceSnapshot(root);
  if(!HASH.test(String(evidence.sourceSnapshotSha256))||evidence.sourceSnapshotSha256!==current.sha256||
     evidence.sourceSnapshotFileCount!==current.files)throw Error('REVIEWED_SOURCE_CHANGED');
 }catch{add('REVIEWED_SOURCE_CHANGED_OR_UNSAFE');}
 try{
  const current=build.compiledOutputSnapshot(root);
  if(!HASH.test(String(evidence.compiledOutputSnapshotSha256))||
     evidence.compiledOutputSnapshotSha256!==current.sha256||
     evidence.compiledOutputSnapshotFileCount!==current.files)throw Error('COMPILED_OUTPUT_CHANGED');
  const artifacts=build.artifacts(root);
  if(!artifacts.ok||!evidence.artifacts?.ok)throw Error('ARTIFACT_POLICY_NOT_PASSED');
  for(const [rel,attrs] of Object.entries(artifacts.entries)){
   const expected=evidence.artifacts.entries?.[rel];
   if(!expected||expected.sha256!==attrs.sha256||expected.bytes!==attrs.bytes)throw Error('ENTRY_ARTIFACT_CHANGED');
  }
 }catch{add('COMPILED_OUTPUT_CHANGED_OR_INVALID');}
 return {schema:'ASSETTRUST_V86_BUILD_PROVENANCE',version,ok:issues.length===0,
  sourceMatched:!issues.includes('REVIEWED_SOURCE_CHANGED_OR_UNSAFE'),
  compiledOutputMatched:!issues.includes('COMPILED_OUTPUT_CHANGED_OR_INVALID'),
  stepsMatched:!issues.includes('INCOMPLETE_OR_UNORDERED_BUILD_STEPS'),
  issues,productionApproved:false,liveDatabaseTested:false,
  note:'Matches local supervised-build evidence to current files; not a signed attestation or production-release approval.'};
}
function plan(){return {schema:'ASSETTRUST_V86_BUILD_PROVENANCE_PLAN',mode:'READ_ONLY',productionApproved:false,
  checks:['current workspace version','original lockfile hash','seven ordered successful build steps',
   'reviewed API/web/SQL/tool source snapshot','all emitted API and web files','compiled artifact policy'],
  next:'After a genuine connected-Kali supervised build, run npm run acceptance:provenance:inspect:v86 before disposable live acceptance.'};}
function main(argv=process.argv.slice(2)){
 try{
  if(argv.length!==1||!['--plan','--inspect'].includes(argv[0]))throw Error('INVALID_V86_ACTION');
  const result=argv[0]==='--plan'?plan():verify();
  console.log(JSON.stringify(result,null,2));
  if(argv[0]==='--inspect'&&!result.ok)process.exitCode=1;
 }catch{console.error('BLOCKED: V86_PROVENANCE_CHECK_FAILED');process.exitCode=1;}
}
if(require.main===module)main();
module.exports={EXPECTED_STEPS,verify,plan,main};
