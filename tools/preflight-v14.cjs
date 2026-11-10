'use strict';
/** Offline check to give Kali/Linux developers actionable information before a build. */
const fs=require('node:fs');const path=require('node:path');
const {createRequire}=require('node:module');
const {evaluateBuildPrerequisites}=require('./preflight-policy-v14.cjs');
const root=path.resolve(__dirname,'..');
const selected={
 api:['@nestjs/common','@nestjs/core','@nestjs/platform-express','pg','argon2','typescript','ts-node','@types/node'],
 web:['react','react-dom','vite','@vitejs/plugin-react','maplibre-gl','typescript','@types/react']
};
function hasInstalledPackage(workspace,pkg){
 // Package entry points can be ESM-only or have restrictive exports; checking
 // for its own package.json avoids wrongly rejecting a properly installed package.
 for(const folder of [path.join(root,'apps',workspace,'node_modules'),path.join(root,'node_modules')]){
  if(fs.existsSync(path.join(folder,pkg,'package.json')))return true;
 }
 try{createRequire(path.join(root,'apps',workspace,'package.json')).resolve(pkg);return true}catch{return false}
}
const available=[];
for(const [name,deps] of Object.entries(selected)){
 for(const pkg of deps){if(hasInstalledPackage(name,pkg))available.push(pkg)}
}
const required=[...new Set(Object.values(selected).flat())];
const result=evaluateBuildPrerequisites({nodeVersion:process.version,required,available,lockfile:fs.existsSync(path.join(root,'package-lock.json'))});
console.log('AssetTrust v0.14 local prerequisite report (does NOT execute a build or database tests):');
console.log(`Node: ${process.version}; installed dependency checks: ${required.length-result.missing.length}/${required.length}`);
if(result.missing.length)console.log('Missing npm packages: '+result.missing.join(', '));
if(result.warnings.length)console.log('Reproducibility notice: no npm package-lock.json; generate and commit a reviewed lockfile once dependencies are installed.');
console.log(result.ok?'PASS: local build prerequisites appear available; run npm run build.':'BLOCKED: fix prerequisites before attempting a full build.');
if(!result.ok)process.exitCode=1;
