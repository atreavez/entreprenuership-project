'use strict';
/** v0.51: independent source-package and lockfile supply-chain guard.
 * Read-only; this cannot substitute for npm ci, npm audit or signing provenance.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {inspectDependencyGraph}=require('./lockfile-integrity-v17.cjs');
const ROOT=path.resolve(__dirname,'..');
const manifestDirs=['','apps/api','apps/web'];
const sections=['dependencies','devDependencies','optionalDependencies','peerDependencies'];
function specRisk(spec){
 if(typeof spec!=='string'||!spec.trim())return 'empty or non-string dependency specifier';
 // Registries handle semver, npm aliases and approved dist-tags; no direct
 // network, local-path, git, workspace escape or executable remote specifiers.
 if(/^(?:file:|link:|git(?:\+[^:]+)?:|https?:|ssh:|github:|gitlab:|bitbucket:|\.\.?\/|\/)/i.test(spec))return 'direct URL, VCS or filesystem dependency is not approved';
 return null;
}
function auditManifest(manifest,name='manifest'){
 const issues=[];
 if(!manifest || typeof manifest!=='object'||Array.isArray(manifest))return [`${name}: invalid manifest`];
 for(const section of sections){
  const deps=manifest[section];
  if(deps===undefined)continue;
  if(!deps||typeof deps!=='object'||Array.isArray(deps)){issues.push(`${name}: invalid ${section}`);continue;}
  for(const [dep,spec] of Object.entries(deps)){
   const reason=specRisk(spec);
   if(reason)issues.push(`${name} ${section} ${dep}: ${reason}`);
  }
 }
 return issues;
}
function auditLockedUrls(lock,{trustedHosts=['registry.npmjs.org']}={}){
 const issues=[];let checked=0,installScriptCount=0;
 if(!lock||lock.lockfileVersion!==3||!lock.packages||typeof lock.packages!=='object')
  return {issues:['Missing npm v3 resolved dependency graph'],checked,installScriptCount};
 const trusted=new Set(trustedHosts);
 for(const [pkg,meta] of Object.entries(lock.packages)){
  if(!meta||typeof meta!=='object'){issues.push(`${pkg||'(root)'}: malformed package snapshot`);continue;}
  if(meta.link)continue;
  if(meta.hasInstallScript===true)installScriptCount++;
  const resolved=meta.resolved;
  if(resolved===undefined)continue;
  if(typeof resolved!=='string'){issues.push(`${pkg}: invalid resolved value`);continue;}
  // Registry snapshots must come from explicitly reviewed HTTPS registries.
  // Local workspaces have link:true and are handled above.
  let url;
  try{url=new URL(resolved);}catch{issues.push(`${pkg}: non-URL package source`);continue;}
  if(url.protocol!=='https:'||!trusted.has(url.hostname)||url.username||url.password||url.hash||url.search)
    issues.push(`${pkg}: unapproved, non-HTTPS or credential-bearing package source`);
  checked++;
 }
 return {issues,checked,installScriptCount};
}
function audit(root=ROOT){
 const issues=[];let lock,lockSha256=null;
 const manifests=[];
 for(const dir of manifestDirs){
  try{
   const manifest=JSON.parse(fs.readFileSync(path.join(root,dir,'package.json'),'utf8'));
   manifests.push(manifest);issues.push(...auditManifest(manifest,dir||'(root)'));
  }catch{issues.push(`Unreadable package.json: ${dir||'(root)'}`);}
 }
 try{const bytes=fs.readFileSync(path.join(root,'package-lock.json'));lockSha256=crypto.createHash('sha256').update(bytes).digest('hex');lock=JSON.parse(bytes.toString('utf8'));}
 catch{issues.push('Authentic package-lock.json missing or unreadable; do not synthesize one');}
 let checked=0,installScriptCount=0;
 if(lock){
  const urls=auditLockedUrls(lock);
  issues.push(...urls.issues);checked=urls.checked;installScriptCount=urls.installScriptCount;
  try{issues.push(...inspectDependencyGraph(root).failures);}catch{issues.push('Dependency graph verification did not complete');}
 }
 return {schema:'ASSETTRUST_V51_SUPPLY_CHAIN_POLICY',ok:issues.length===0,lockfileSha256:lockSha256,issues,reviewRequired:{installScriptCount,registryTarballsChecked:checked},notes:'Static manifest and lockfile review. Requires online npm ci, npm audit, full builds and independent SBOM/signature review.'};
}
if(require.main===module){const result=audit();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
module.exports={specRisk,auditManifest,auditLockedUrls,audit};
