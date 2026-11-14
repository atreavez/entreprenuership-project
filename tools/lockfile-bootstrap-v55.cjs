'use strict';
/**
 * AssetTrust v0.55: explicit lockfile bootstrap on a connected trusted developer host.
 * --check is read-only; --generate needs explicit opt-in and never invents a resolved graph.
 * This is not a substitute for npm ci, npm audit, builds, RLS E2E or security sign-off.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {audit,auditManifest}=require('./supply-chain-policy-v51.cjs');
const ROOT=path.resolve(__dirname,'..');
const MANIFEST_PATHS=['package.json','apps/api/package.json','apps/web/package.json'];
const REGISTRY='https://registry.npmjs.org/';
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function assertRealFile(file){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Not a regular file or symlink is forbidden: '+path.basename(file));
}
function inspectProject(root=ROOT){
 const issues=[],originals=[];
 for(const name of MANIFEST_PATHS){
  const file=path.join(root,name);
  try{
   assertRealFile(file);
   const bytes=fs.readFileSync(file);const data=JSON.parse(bytes.toString('utf8'));
   originals.push({file,name,sha256:sha(bytes),data});
   issues.push(...auditManifest(data,name));
  }catch(e){issues.push(`Missing/invalid manifest ${name}: ${e.code||e.message}`);}
 }
 if(originals.length===3){
  const [rootManifest,api,web]=originals.map(x=>x.data);
  const versions=new Set([rootManifest.version,api.version,web.version]);
  if(rootManifest.name!=='assettrust-platform'||api.name!=='@assettrust/api'||web.name!=='@assettrust/web')issues.push('Unexpected AssetTrust workspace identity');
  if(versions.size!==1)issues.push('Root and workspace versions must match');
  if(!Array.isArray(rootManifest.workspaces)||!['apps/api','apps/web'].every(x=>rootManifest.workspaces.includes(x)))issues.push('Both workspaces must be declared');
 }
 const lock=path.join(root,'package-lock.json');
 let lockExists=false;
 try{assertRealFile(lock);lockExists=true;}catch(e){
  if(e.code!=='ENOENT')issues.push(`Unsafe lockfile path: ${e.message}`);
 }
 return {root,issues,originals,lock,lockExists,ok:issues.length===0};
}
function ensureToolchain(nodeVersion=process.versions.node){
 const [major,minor]=nodeVersion.split('.').map(Number);
 if(major<22||(major===22&&minor<12))throw Error('Node.js >=22.12 required');
}
function generate(root=ROOT,env=process.env,runner=spawnSync){
 const project=inspectProject(root);
 if(!project.ok)throw Error('Manifest preflight blocked: '+project.issues.join('; '));
 if(project.lockExists)throw Error('Existing lockfile must be verified, not overwritten');
 if(env.NODE_ENV==='production')throw Error('Never generate a dependency lockfile on a production runtime host');
 if(env.ASSETTRUST_V55_CREATE_LOCKFILE!=='YES')throw Error('Set ASSETTRUST_V55_CREATE_LOCKFILE=YES to authorize a new authentic lockfile');
 ensureToolchain();
 // Npm is invoked directly without shell, with scripts disabled and only the reviewed public registry.
 const args=['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund','--strict-peer-deps','--registry='+REGISTRY];
 let run;
 try{run=runner('npm',args,{cwd:root,env:{...env,npm_config_ignore_scripts:'true',npm_config_registry:REGISTRY},stdio:'inherit',timeout:15*60*1000});}
 catch(e){run={status:null,error:e};}
 const modifications=project.originals.filter(x=>!fs.existsSync(x.file)||sha(fs.readFileSync(x.file))!==x.sha256).map(x=>x.name);
 const errors=[];
 if(run.status!==0||run.error||run.signal)errors.push('npm registry resolution failed, timed out, or returned nonzero');
 if(modifications.length)errors.push('npm unexpectedly changed manifests: '+modifications.join(','));
 let result=null;
 if(!errors.length){result=audit(root);if(!result.ok)errors.push(...result.issues);}
 if(errors.length){
  // The only file owned by this operation is a lockfile created by it; never delete an existing lock.
  if(!project.lockExists&&fs.existsSync(project.lock)){
   const entry=fs.lstatSync(project.lock);
   if(entry.isFile()&&!entry.isSymbolicLink())fs.unlinkSync(project.lock);
  }
  throw Error('Authentic lockfile bootstrap failed: '+errors.join('; '));
 }
 return {ok:true,generated:true,source:'npm-registry-resolved',registry:REGISTRY,sha256:result.lockfileSha256,packageCount:result.reviewRequired.registryTarballsChecked,installScriptsForManualReview:result.reviewRequired.installScriptCount,notice:'Lockfile created by npm. Next run npm ci, npm audit, full builds and live tests; do not deploy yet.'};
}
function check(root=ROOT){
 const project=inspectProject(root);
 const verified=project.lockExists?audit(root):null;
 return {schema:'ASSETTRUST_V55_LOCKFILE_BOOTSTRAP',ok:project.ok&&!!verified?.ok,productionApproved:false,
  version:project.originals[0]?.data.version||null,lockfilePresent:project.lockExists,sha256:verified?.lockfileSha256||null,
  issues:[...project.issues,...(!project.lockExists?['Authentic package-lock.json missing; use an explicitly authorized connected npm bootstrap']:[]),...(verified?.issues||[])],
  next:'Only on connected trusted Kali: authorize --generate if missing, then npm ci, audit, build and supervised release tests.'};
}
function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--check','--generate'].includes(args[0]))throw Error('Use --check (read-only) or --generate (explicit opt-in)');
 const output=args[0]==='--check'?check():generate();
 console.log(JSON.stringify(output,null,2));return output.ok;
}
if(require.main===module){try{if(!main())process.exitCode=1;}catch(e){console.error('BLOCKED: '+e.message);process.exitCode=1;}}
module.exports={inspectProject,ensureToolchain,generate,check,main,REGISTRY,MANIFEST_PATHS};
