'use strict';
/** Read-only v0.40 preflight. This does not connect to a database or claim release clearance. */
const fs=require('node:fs'),path=require('node:path');
const {buildPlan}=require('./migrations/plan.cjs');
const ROOT=path.resolve(__dirname,'..');
const VERSION='v0.40';
function inspect(root=ROOT){
 const checks=[];
 const mark=(id,pass,detail)=>checks.push({id,pass,detail});
 const version=process.versions.node.split('.').map(Number);mark('node-runtime',version[0]>22||(version[0]===22&&version[1]>=12),`Node ${process.versions.node}; requires >=22.12`);
 const lock=path.join(root,'package-lock.json');let lockInfo=null;
 try{lockInfo=JSON.parse(fs.readFileSync(lock,'utf8'));}catch{}
 mark('lockfile-present',!!lockInfo&&Number(lockInfo.lockfileVersion)>=3&&!!lockInfo.packages,'Reviewed lockfile is required (presence/structure only; NOT dependency verification)');
 const deps=['@nestjs/common','pg','react','vite'];
 for(const dep of deps){let found=false;try{require.resolve(dep,{paths:[root,path.join(root,'apps/api'),path.join(root,'apps/web')]});found=true;}catch{}
 mark('dependency-'+dep,found,`${dep} must be installed`);}
 const manifestPath=path.join(root,'apps/api/src/contexts/platform/domain/schema-manifest.ts');
 let manifest='';try{manifest=fs.readFileSync(manifestPath,'utf8')}catch{}
 let plan=[];try{plan=buildPlan(path.join(root,'apps/api/sql'))}catch{}
 const valid=plan.length>=18&&plan.every(m=>manifest.includes(`filename: '${m.filename}', sha256: '${m.sha256}'`));
 mark('source-migration-fingerprints',valid,`${plan.length} forward-only SQL files; verify exact fingerprints`);
 mark('environment-file',fs.existsSync(path.join(root,'.env')),'A locally reviewed .env is required; values are NOT read or printed');
 return {schema:'ASSETTRUST_RELEASE_PREFLIGHT_V40',version:VERSION,readyForRelease:false,
  checks,unverified:['Full clean npm ci and production builds','Applied PostgreSQL/PostGIS migration and rollback-safe integration','Authenticated two-admin and recipient browser journeys','TLS, network abuse protection, backup restoration and legal/privacy/security review'],
  next:'Obtain a reviewed lockfile, install dependencies, run migration checks and disposable PostgreSQL integration, then full builds and browser/security tests. A passing read-only preflight is not a production approval.'};
}
if(require.main===module){const report=inspect();if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));else{
 console.log('AssetTrust v0.40 read-only release preflight — NOT a production approval');
 for(const c of report.checks)console.log((c.pass?'PASS':'BLOCK')+' '+c.id+' — '+c.detail);
 console.log('\nUnverified gates: '+report.unverified.join('; '));
 }process.exitCode=report.checks.every(c=>c.pass)?0:1;}
module.exports={inspect};
