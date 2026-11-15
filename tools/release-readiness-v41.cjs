'use strict';
/**
 * Read-only v0.41 release preflight. Static/prerequisite inspection ONLY:
 * the report always says productionApproved:false and never silently runs a DB write.
 */
const fs=require('node:fs');const path=require('node:path');
const {inspectDependencyGraph}=require('./lockfile-integrity-v17.cjs');
const {validateCi}=require('./ci-completeness-v41.cjs');
const {buildPlan}=require('./migrations/plan.cjs');
const ROOT=path.resolve(__dirname,'..');
function inspect(root=ROOT,{env=process.env}={}){
 const checks=[];const add=(name,pass,description)=>checks.push({name,pass:Boolean(pass),description});
 const [major,minor]=process.versions.node.split('.').map(Number);
 add('supported-node',major>22||(major===22&&minor>=12),'Node >=22.12 runtime');
 const ci=validateCi({root});add('ci-coverage-contract',ci.ok,`${ci.versionSuiteCount} offline suites and ${ci.pgContractCount} declared PostgreSQL contracts are present in CI workflow`);
 const dep=inspectDependencyGraph(root);add('reviewed-lockfile-graph',dep.ok,dep.ok?'All declared workspace deps have valid lockfile resolution':'Authentic npm lockfile absent or inconsistent with workspace manifests');
 const modules=['@nestjs/common','pg','react','vite'];
 for(const mod of modules){let ok=false;
  for(const location of [path.join(root,'node_modules'),path.join(root,'apps/api/node_modules'),path.join(root,'apps/web/node_modules')]){
   if(fs.existsSync(path.join(location,mod,'package.json'))){ok=true;break;}
  }
  add('installed-'+mod,ok,`${mod} installed under target project root`);
 }
 add('api-build-output',fs.existsSync(path.join(root,'apps/api/dist/main.js')),'Compiled API main.js exists (presence only, not runtime proof)');
 add('web-build-output',fs.existsSync(path.join(root,'apps/web/dist/index.html')),'Generated Vite index.html exists (presence only, not browser proof)');
 let migrationsOk=false,count=0;try{
  const plan=buildPlan(path.join(root,'apps/api/sql'));count=plan.length;
  const manifest=fs.readFileSync(path.join(root,'apps/api/src/contexts/platform/domain/schema-manifest.ts'),'utf8');
  migrationsOk=plan.length>=18 && plan.every(m=>manifest.includes(`filename: '${m.filename}', sha256: '${m.sha256}'`));
 }catch{}
 add('migration-source-fingerprints',migrationsOk,`${count} migration SQL files match their pinned SHA-256 manifest`);
 // GitHub Actions environment supplies in-memory secrets; local preflight needs .env.
 const config=env.CI==='true' ? ['DATABASE_URL','JWT_SECRET','MFA_ENCRYPTION_KEY','DOCUMENT_ENCRYPTION_KEYS'].every(s=>typeof env[s]==='string'&&env[s].length>0) : fs.existsSync(path.join(root,'.env'));
 add('runtime-configuration-present',config,'CI environment secrets populated, or local .env exists; content/security checks are separate');
 const passed=checks.filter(c=>c.pass).length;
 return {schema:'ASSETTRUST_READ_ONLY_PREFLIGHT_V41',version:'0.41.0',prerequisitesPass:checks.every(c=>c.pass),productionApproved:false,checks,
  status:checks.every(c=>c.pass)?'LOCAL_PREREQUISITES_PRESENT_NOT_RELEASE_APPROVAL':'BLOCKED_PREREQUISITES',
  gateCount:{passed,total:checks.length},
  unverified:['Successful clean npm ci execution and complete npm test/build on deployment target','Applied all versioned migrations, PostGIS and live PostgreSQL contracts','Two independently authenticated administrators and recipient browser download tests','Full two-API-instance HTTP race test, rate-limiting at the reverse proxy','HTTPS, restore drill, signing-key custody, independent security and Uganda legal/privacy review'],
  notes:'CI/source checks and artifact presence cannot establish legal land title truth, customer identity, or production readiness.'};
}
if(require.main===module){const r=inspect();
 if(process.argv.includes('--json'))console.log(JSON.stringify(r,null,2));
 else{
  console.log(`AssetTrust v0.41 read-only preflight: ${r.status}; ${r.gateCount.passed}/${r.gateCount.total} prerequisites present; NOT a release approval`);
  for(const c of r.checks)console.log(`${c.pass?'PASS':'BLOCK'} ${c.name} — ${c.description}`);
  console.log('\nRemaining live proof: '+r.unverified.join('; '));
 }
 if(!r.prerequisitesPass)process.exitCode=1;
}
module.exports={inspect};
