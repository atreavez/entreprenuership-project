'use strict';
/**
 * Dependency-free, fail-closed CI coverage contract.
 * Prevents future releases from silently omitting late-version policy and live DB suites.
 * Static configuration checks are NOT proof that GitHub Actions actually ran.
 */
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const normalize=s=>s.replace(/\r\n/g,'\n');
function validateCi({root=ROOT,workflow,manifest}={}){
 const issues=[];
 const file=path.join(root,'.github/workflows/ci.yml');
 let yaml=workflow,pkg=manifest;
 try{if(yaml===undefined)yaml=fs.readFileSync(file,'utf8')}catch(e){issues.push('Missing GitHub Actions workflow');yaml=''}
 try{if(pkg===undefined)pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))}catch(e){issues.push('Missing or invalid root package manifest');pkg={}}
 if(typeof yaml!=='string')yaml='';yaml=normalize(yaml);
 const scripts=pkg.scripts||{};
 const mentioned=[...yaml.matchAll(/\bnpm\s+run\s+([\w:.-]+)/g)].map(m=>m[1]);
 const executed=new Set(mentioned);
 const isPresent=s=>executed.has(s);
 const versionScripts=Object.keys(scripts).filter(s=>/^verify:v\d{2}$/.test(s)).sort();
 if(versionScripts.length===0)issues.push('No version check scripts declared');
 else{
  const nums=versionScripts.map(s=>Number(s.split('v').at(-1)));
  const last=Math.max(...nums);
  for(let n=3;n<=last;n++){
   const key=`verify:v${String(n).padStart(2,'0')}`;
   if(!scripts[key])issues.push(`Missing version check in package manifest: ${key}`);
   if(!isPresent(key))issues.push(`CI omits version check: ${key}`);
  }
 }
 const pgScripts=Object.keys(scripts).filter(s=>s.startsWith('test:pg:')).sort();
 for(const script of pgScripts)if(!isPresent(script))issues.push(`CI omits disposable PostgreSQL contract: ${script}`);
 const multiApiScripts=Object.keys(scripts).filter(s=>/^test:e2e:two-api:v\d+$/.test(s)).sort();
 for(const script of multiApiScripts)if(!isPresent(script))issues.push(`CI omits two-instance integration contract: ${script}`);
 if(multiApiScripts.length>0&&!/ASSETTRUST_V42_TWO_API_CONTRACT:\s*YES/.test(yaml))issues.push('CI two-API integration requires explicit v0.42 authorization');
 for(const key of ['verify:ci:v41','verify:architecture','verify:syntax','smoke:offline','release:gate:v17','release:gate','preflight:v14','build','db:check','test:e2e:ci','release:preflight:v41']) {
  if(!isPresent(key) && !(key==='test:e2e:ci'&&/node\s+tools\/ci-live-integration\.mjs/.test(yaml)))issues.push(`CI omits required gate: ${key}`);
 }
 if(!/(^|\n)\s*-?\s*run:\s*npm\s+ci(?:\s|$)/m.test(yaml))issues.push('CI lacks an explicit clean npm ci install');
 if(!/\bpostgres:\s*\n\s*image:\s*postgis\/postgis:/m.test(yaml))issues.push('CI lacks PostGIS PostgreSQL service');
 if(!/ASSETTRUST_E2E_ALLOW_MUTATION:\s*YES/.test(yaml))issues.push('CI PG contracts require explicit scoped mutation authorization');
 if(!/npm\s+run\s+db:migrate/.test(yaml))issues.push('CI does not apply migrations to disposable database');
 if(!/npm\s+test\b/.test(yaml))issues.push('CI omits API unit test suite');
 if(/\bcontinue-on-error\s*:\s*true\b/i.test(yaml))issues.push('Fail-open continue-on-error:true is forbidden in release CI');
 if(/\|\|\s*true\b/.test(yaml))issues.push('Fail-open || true is forbidden in release CI');
 if(/\bnpm\s+(?:install|i)\b/.test(yaml))issues.push('CI must use npm ci, not npm install');
 // The workflow itself must be executed on push and pull request; not workflow_dispatch alone.
 if(!/\bpush\s*:/m.test(yaml) || !/\bpull_request\s*:/m.test(yaml))issues.push('CI must be triggered by push and pull_request');
 return {schema:'ASSETTRUST_CI_COVERAGE_V41',ok:issues.length===0,versionSuiteCount:versionScripts.length,pgContractCount:pgScripts.length,issues};
}
if(require.main===module){const result=validateCi();
 if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
 else {console.log(`AssetTrust v0.41 CI configuration contract: ${result.ok?'PASS':'FAIL'}; ${result.versionSuiteCount} declared versions, ${result.pgContractCount} PostgreSQL contracts`);
 for(const issue of result.issues)console.error('BLOCK:',issue);
 if(result.ok)console.log('Static CI suite coverage matches package scripts. Live execution is NOT verified.');}
 if(!result.ok)process.exitCode=1;
}
module.exports={validateCi};
