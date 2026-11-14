'use strict';
/**
 * AssetTrust v0.53 supervised evidence completeness checker (read only).
 * Validates the shape, coverage and integrity of v0.51's actual CLI result file.
 * A locally editable report is not independent attestation or production approval.
 * This utility does not launch any tests or access the database.
 */
const fs=require('node:fs');
const path=require('node:path');
const {plan}=require('./release-validation-v51.cjs');
const {audit}=require('./supply-chain-policy-v51.cjs');
const ROOT=path.resolve(__dirname,'..');
function verify(root=ROOT,{requireGit=true,checkLockfile=true,summary,historyRepo=process.env.ASSETTRUST_HISTORY_REPO}={}){
 const issues=[];
 let rootVersion='unknown',doc=null;
 try{rootVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;}
 catch{issues.push('Unreadable package manifest');}
 const file=summary||path.join(root,'test-evidence/v51/local-validation-summary.json');
 try{
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('not a regular evidence file');
  if(stat.mode&0o077)issues.push('Validation result permissions are too broad (require 0600)');
  doc=JSON.parse(fs.readFileSync(file,'utf8'));
 }catch{issues.push('Supervised v0.51 --full validation output not present or unreadable');}
 if(requireGit){
  const gitRoot=historyRepo?path.resolve(historyRepo):root;
  if(!fs.existsSync(path.join(gitRoot,'.git')))issues.push('Full original Git repository history is missing; set ASSETTRUST_HISTORY_REPO to the canonical clone when validating a ZIP');
 }
 if(checkLockfile){
  const supply=audit(root);
  if(!supply.ok)issues.push('Authentic npm lockfile/source graph is absent or fails source policy');
 }
 let expected=[];
 try{const planned=plan(root);expected=[...planned.build,...planned.database].map(s=>s.name);}
 catch{issues.push('Could not derive expected release-stage plan from package.json');}
 if(doc){
  if(doc.schema!=='ASSETTRUST_V51_SUPERVISED_VALIDATION')issues.push('Wrong supervised validation schema');
  if(doc.mode!=='--full')issues.push('Evidence must cover --full: build plus PostgreSQL contracts');
  if(doc.sourceVersion!==rootVersion)issues.push('Evidence source version differs from current code');
  if(doc.productionApproved!==false)issues.push('Report must never assert production approval');
  if(doc.status!=='VALIDATION_STEPS_PASSED_NOT_RELEASE_APPROVAL')issues.push('Validation was not fully successful');
  if(!Array.isArray(doc.steps))issues.push('Missing ordered step evidence');
  else{
   if(doc.steps.length!==expected.length)issues.push(`Incomplete stage evidence: ${doc.steps.length}/${expected.length}`);
   for(let i=0;i<Math.max(doc.steps.length,expected.length);i++){
    const item=doc.steps[i];if(!item || typeof item!=='object')continue;
    if(item.name!==expected[i])issues.push(`Stage ${i+1} differs from required plan`);
    if(item.ok!==true||item.exitCode!==0)issues.push(`Stage ${i+1} failed or has no passing exit code`);
    if(!Number.isSafeInteger(item.durationMs)||item.durationMs<0)issues.push(`Stage ${i+1} has invalid execution duration`);
   }
   for(const marker of ['live-clamav-scanner','full-git-history-secret-scan','api-and-web-build','migrate-disposable-database','two-real-api-instances','supervised-http-integrations']){
    if(!doc.steps.some(s=>s?.name===marker&&s.ok===true&&s.exitCode===0))issues.push(`Missing passed mandatory stage: ${marker}`);
   }
  }
 }
 return {schema:'ASSETTRUST_V53_RELEASE_EVIDENCE_REVIEW',sourceVersion:rootVersion,ok:issues.length===0,productionApproved:false,stagesRequired:expected.length,stagesReported:Array.isArray(doc?.steps)?doc.steps.length:0,issues,
  disclaimer:'Local check of reported test completion; it does not verify remote CI provenance, attestations, legal correctness, TLS, key custody or production security.'};
}
if(require.main===module){const report=verify();console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;}
module.exports={verify};
