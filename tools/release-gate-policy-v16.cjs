"use strict";
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
function inspectRelease(root){
 const failures=[];const warnings=[];
 const files=['package.json','apps/api/package.json','apps/web/package.json','.github/workflows/ci.yml'];
 for(const f of files)if(!existsSync(join(root,f)))failures.push('Missing '+f);
 const lockPath=join(root,'package-lock.json');
 if(!existsSync(lockPath))failures.push('Missing reviewed package-lock.json: use npm install once in a connected environment, review and commit it, then npm ci.');
 else{
  try{
   const lock=JSON.parse(readFileSync(lockPath,'utf8'));
   const rootPackage=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
   if(!lock.lockfileVersion||lock.lockfileVersion<3)failures.push('Lockfile should use npm lockfileVersion 3 or later');
   if(lock.packages?.['']?.name!==rootPackage.name)failures.push('Lockfile root package mismatch');
   for(const dir of ['apps/api','apps/web'])if(!lock.packages?.[dir])failures.push('Lockfile workspace missing: '+dir);
  }catch(e){failures.push('Unreadable or invalid lockfile: '+e.message)}
 }
 if(existsSync(join(root,'.github/workflows/ci.yml'))){
  const workflow=readFileSync(join(root,'.github/workflows/ci.yml'),'utf8');
  if(!/npm ci\b/.test(workflow))failures.push('CI must use npm ci (not npm install) for reproducible dependencies');
  if(!/npm run build\b/.test(workflow))failures.push('CI must perform a full build');
  if(!/db:migrate/.test(workflow)||!/db:check/.test(workflow))failures.push('CI must run and check DB migrations');
  if(!/ci-live-integration/.test(workflow))failures.push('CI must run supervised HTTP integration tests');
 }
 if(existsSync(join(root,'node_modules')))warnings.push('A node_modules directory exists; release verification still requires clean npm ci in CI');
 return {ok:failures.length===0,failures,warnings};
}
module.exports={inspectRelease};
