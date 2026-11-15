'use strict';
/** AssetTrust v0.65 dependency-free, strictly READ-ONLY runtime diagnosis.
 * --inspect: prints privacy-limited fact codes; no connections or subprocesses.
 * --write: saves the same bounded facts to test-evidence/v65 with mode 0600.
 * NO environment values, URLs, usernames, credentials or client data are output.
 * NEVER a production release certification.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const OUTPUT='test-evidence/v65/runtime-diagnostic.json';
function entryExists(p){try{fs.lstatSync(p);return true;}catch{return false;}}
function regular(p){try{const stat=fs.lstatSync(p);return stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}}
function directory(p){try{const stat=fs.lstatSync(p);return stat.isDirectory()&&!stat.isSymbolicLink();}catch{return false;}}
function executable(name,env=process.env){
 if(!/^[a-z0-9_-]+$/i.test(name))return false;
 const locations=String(env.PATH||'').split(path.delimiter);
 return locations.some(folder=>{
  if(!folder||!path.isAbsolute(folder))return false;
  try {const full=path.join(folder,name);return regular(full)&&(fs.statSync(full).mode&0o111)!==0;}catch{return false;}
 });
}
function checksum(pathname){return crypto.createHash('sha256').update(fs.readFileSync(pathname)).digest('hex');}
function versionConsistency(root){
 try{
  const packages=['package.json','apps/api/package.json','apps/web/package.json'].map(f=>{
   const p=path.join(root,f);if(!regular(p))throw Error('MISSING');return JSON.parse(fs.readFileSync(p,'utf8'));
  });
  return {version:packages[0].version,consistent:packages.every(p=>p.version===packages[0].version)&&packages[0].name==='assettrust-platform'};
 }catch{return {version:'UNKNOWN',consistent:false};}
}
function sourceMigrations(root){
 // Compare SHA-256 of the source SQL against the immutable application
 // manifest, independently of any DB connection or external npm dependency.
 const sqlDir=path.join(root,'apps/api/sql');
 const manifestPath=path.join(root,'apps/api/src/contexts/platform/domain/schema-manifest.ts');
 try{
  if(!directory(sqlDir)||!regular(manifestPath))return {sourceCount:0,manifestCount:0,hashesMatch:false};
  const expected=[...fs.readFileSync(manifestPath,'utf8').matchAll(/filename:\s*'([^']+)',\s*sha256:\s*'([0-9a-f]{64})'/g)]
   .map(m=>({filename:m[1],sha256:m[2]}));
  const source=fs.readdirSync(sqlDir).filter(f=>f.endsWith('.sql')).sort();
  const unique=new Set(expected.map(x=>x.filename));
  const hashesMatch=source.length>0&&source.length===expected.length&&unique.size===source.length&&
    source.every((filename,i)=>filename===expected[i].filename&&regular(path.join(sqlDir,filename))&&checksum(path.join(sqlDir,filename))===expected[i].sha256);
  // Keep this operation side-effect-free: do not call run.cjs or connect to DB.
  return {sourceCount:source.length,manifestCount:expected.length,hashesMatch};
 }catch{return {sourceCount:0,manifestCount:0,hashesMatch:false};}
}
function inspect(root=ROOT,env=process.env){
 const v=versionConsistency(root),migration=sourceMigrations(root);
 const nodeParts=process.versions.node.split('.').map(Number);
 const nodeSupported=nodeParts[0]>22||(nodeParts[0]===22&&nodeParts[1]>=12);
 const checks={
  manifestVersionsConsistent:v.consistent,
  migrationSourceChecksumsMatch:migration.hashesMatch,
  nodeSupported,
  lockfilePresent:regular(path.join(root,'package-lock.json')),
  dependenciesDirectoryPresent:directory(path.join(root,'node_modules')),
  apiCompiledArtifactPresent:regular(path.join(root,'apps/api/dist/main.js')),
  webCompiledArtifactPresent:regular(path.join(root,'apps/web/dist/index.html')),
  originalGitHistoryPresent:directory(path.join(root,'.git'))||regular(path.join(root,'.git')),
  psqlClientExecutablePresent:executable('psql',env),
  postgresExecutablePresent:executable('postgres',env),
  clamavScannerExecutablePresent:executable('clamdscan',env)||executable('clamscan',env),
  operatorAndRuntimeDatabaseUrlsConfigured:Boolean(env.DATABASE_URL&&env.ASSETTRUST_RUNTIME_DATABASE_URL),
 };
 const issues=[];
 if(!v.consistent)issues.push('VERSION_MISMATCH');
 if(!migration.hashesMatch)issues.push('SOURCE_MIGRATION_CHECKSUM_MISMATCH');
 if(!nodeSupported)issues.push('NODE_BELOW_MINIMUM');
 if(!checks.lockfilePresent)issues.push('AUTHENTIC_LOCKFILE_REQUIRED');
 if(!checks.dependenciesDirectoryPresent)issues.push('NPM_INSTALL_REQUIRED');
 if(!checks.apiCompiledArtifactPresent||!checks.webCompiledArtifactPresent)issues.push('COMPILATION_EVIDENCE_MISSING');
 if(!checks.originalGitHistoryPresent)issues.push('ORIGINAL_GIT_HISTORY_REQUIRED');
 if(!checks.operatorAndRuntimeDatabaseUrlsConfigured)issues.push('DISPOSABLE_DATABASE_ROLES_NOT_CONFIGURED');
 if(!checks.psqlClientExecutablePresent)issues.push('POSTGRES_CLIENT_NOT_FOUND_IN_PATH');
 if(!checks.clamavScannerExecutablePresent)issues.push('CLAMAV_BINARY_NOT_FOUND_IN_PATH');
 // Presence checks cannot guarantee a real scanner/DB works or an authentic lockfile.
 return {schema:'ASSETTRUST_V65_READ_ONLY_RUNTIME_DIAGNOSIS',version:v.version,
  productionApproved:false,liveDatabaseTested:false,fullBuildTested:false,
  nodeVersion:process.versions.node,migrationSourceCount:migration.sourceCount,
  manifestMigrationCount:migration.manifestCount,checks,issues,
  next:'Inspect these prerequisite codes, then run v64 supervised build and disposable database validation on connected Kali. No prerequisite alone is evidence of a successful live test.'};
}
function write(root=ROOT,report){
 const dirs=[path.join(root,'test-evidence'),path.join(root,'test-evidence','v65')];
 for(const p of dirs){
  if(entryExists(p)&&!directory(p))throw Error('Unsafe evidence directory');
  if(!entryExists(p))fs.mkdirSync(p,{recursive:false,mode:0o700});
 }
 const target=path.join(root,OUTPUT);
 if(entryExists(target)&&!regular(target))throw Error('Unsafe evidence file');
 // O_EXCL prevents a race from replacing the target with a linked file.
 const scratch=path.join(path.dirname(target),'.diagnostic-'+crypto.randomBytes(12).toString('hex'));
 const fd=fs.openSync(scratch,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{if(entryExists(target)&&!regular(target))throw Error('Unsafe evidence file');fs.renameSync(scratch,target);fs.chmodSync(target,0o600);}
 finally{if(entryExists(scratch))fs.unlinkSync(scratch);}
 return OUTPUT;
}
function main(args=process.argv.slice(2)){
 try{
  if(args.length!==1||!['--inspect','--write'].includes(args[0]))throw Error('Use exactly --inspect or --write');
  const output=inspect();
  if(args[0]==='--write')write(ROOT,output);
  console.log(JSON.stringify(output,null,2));
  // Read-only diagnosis exits zero even if prerequisites are absent: use the
  // issue array for troubleshooting; never interpret zero as release PASS.
 }catch(error){console.error('BLOCKED: diagnostic command rejected unsafe execution');process.exitCode=1;}
}
if(require.main===module)main();
module.exports={inspect,write,sourceMigrations,versionConsistency,regular,directory,executable,main};
