'use strict';
/**
 * Static, dependency-free validation of the npm v3 lockfile against all workspace
 * manifests. This is a PRECONDITION for `npm ci`, never a substitute for `npm ci`.
 * Do not synthesize package-lock.json; generate it with npm on a connected machine.
 */
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const SECTIONS=['dependencies','devDependencies','optionalDependencies','peerDependencies'];
const WORKSPACES=['apps/api','apps/web'];
function readJson(path,failures){
 try{return JSON.parse(readFileSync(path,'utf8'));}
 catch(e){failures.push(`Cannot read ${path.endsWith('package-lock.json')?'package-lock.json':'package.json'}: ${e.code||e.message}`);return null;}
}
function findLockedDependency(packages, fromPath, name){
 let base=fromPath;
 for(;;){
  const candidate=(base?base+'/':'')+'node_modules/'+name;
  if(packages[candidate])return candidate;
  const ancestor=base.lastIndexOf('/node_modules/');
  if(ancestor>=0){base=base.slice(0,ancestor);continue;}
  if(base){base='';continue;}
  return null;
 }
}
function validIntegrity(value){
 if(typeof value!=='string')return false;
 const m=/^(sha512|sha384|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!m)return false;
 const expected={sha512:64,sha384:48,sha256:32}[m[1]];
 const decoded=Buffer.from(m[2],'base64');
 return decoded.length===expected && decoded.toString('base64')===m[2];
}
function inspectDependencyGraph(root){
 const failures=[];
 const lock=readJson(join(root,'package-lock.json'),failures);
 const manifests={};
 for(const dir of ['',...WORKSPACES])manifests[dir]=readJson(join(root,dir,'package.json'),failures);
 if(!lock || Object.values(manifests).some(x=>!x))return {ok:false,failures};
 if(lock.lockfileVersion!==3)failures.push('Expected npm lockfileVersion 3');
 if(!lock.packages || typeof lock.packages!=='object'){
  failures.push('Lockfile missing packages dependency graph');return {ok:false,failures};
 }
 const pkgs=lock.packages;
 const rootManifest=manifests[''];
 const declaredWorkspaces=Array.isArray(rootManifest.workspaces)?rootManifest.workspaces:rootManifest.workspaces?.packages;
 if(!Array.isArray(declaredWorkspaces)||WORKSPACES.some(w=>!declaredWorkspaces.includes(w)))failures.push('Root package.json must list both workspaces');
 if(!Array.isArray(pkgs['']?.workspaces)||WORKSPACES.some(w=>!pkgs[''].workspaces.includes(w)))failures.push('Lockfile root workspaces are incomplete');
 if(lock.name!==rootManifest.name || lock.version!==rootManifest.version)failures.push('Lockfile top-level name/version mismatch');
 for(const dir of ['',...WORKSPACES]){
  const manifest=manifests[dir],snapshot=pkgs[dir];
  if(!snapshot){failures.push(`Lockfile missing package snapshot ${dir||'(root)'}`);continue;}
  if(manifest.name!==snapshot.name)failures.push(`Package name mismatch in ${dir||'(root)'}`);
  if(manifest.version!==snapshot.version)failures.push(`Package version mismatch in ${dir||'(root)'}`);
  for(const section of SECTIONS){
   const expected=manifest[section]||{},actual=snapshot[section]||{};
   for(const [name,range] of Object.entries(expected)){
    if(actual[name]!==range)failures.push(`Dependency spec mismatch: ${dir||'(root)'} ${section} ${name} (${range} vs ${actual[name]??'missing'})`);
    // Root/workspace-local npm resolution, including hoisted packages.
    if(!findLockedDependency(pkgs,dir,name))failures.push(`Missing resolved lockfile entry for ${dir||'(root)'} dependency ${name}`);
   }
   for(const name of Object.keys(actual))if(!(name in expected))failures.push(`Unlisted dependency in lock snapshot ${dir||'(root)'} ${section} ${name}`);
  }
 }
 for(const dir of WORKSPACES){
  const manifest=manifests[dir];
  const entry=pkgs[`node_modules/${manifest.name}`];
  if(!entry || entry.link!==true || entry.resolved!==dir)failures.push(`Invalid workspace link for ${manifest.name}`);
 }
 for(const [path,snapshot] of Object.entries(pkgs)){
  if(!snapshot||typeof snapshot!=='object'){failures.push(`Invalid package-lock entry ${path}`);continue;}
  if(path.startsWith('node_modules/') && !snapshot.link){
   for(const name of Object.keys(snapshot.dependencies||{})){
    if(!findLockedDependency(pkgs,path,name))failures.push(`Missing transitive dependency ${name} required by ${path}`);
   }
  }
  if(typeof snapshot.resolved==='string' && /^https?:\/\//.test(snapshot.resolved)){
   if(!validIntegrity(snapshot.integrity))
    failures.push(`Missing or invalid Subresource Integrity hash for ${path}`);
  }
 }
 return {ok:failures.length===0,failures};
}
module.exports={inspectDependencyGraph};
