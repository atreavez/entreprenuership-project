'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const ROOT=path.resolve(__dirname,'../..');
const {inspectProject,ensureToolchain,generate,check,REGISTRY}=require('../lockfile-bootstrap-v55.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v55-lock-'));
 for(const dir of ['apps/api','apps/web'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 const base={name:'assettrust-platform',version:'0.55.0',workspaces:['apps/api','apps/web']};
 const api={name:'@assettrust/api',version:'0.55.0',dependencies:{}};
 const web={name:'@assettrust/web',version:'0.55.0',dependencies:{}};
 for(const [name,x] of [['package.json',base],['apps/api/package.json',api],['apps/web/package.json',web]])fs.writeFileSync(path.join(root,name),JSON.stringify(x));
 function writeLock(extra={}){
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({name:base.name,version:base.version,lockfileVersion:3,packages:{'':{name:base.name,version:base.version,workspaces:base.workspaces},'apps/api':api,'apps/web':web,'node_modules/@assettrust/api':{resolved:'apps/api',link:true},'node_modules/@assettrust/web':{resolved:'apps/web',link:true},...extra}}));
 }
 return {root,writeLock};
}
const authorized={ASSETTRUST_V55_CREATE_LOCKFILE:'YES'};
test('read-only check blocks an absent authentic npm lockfile',()=>{const {root}=fixture();try{const r=check(root);assert.equal(r.ok,false);assert.equal(r.lockfilePresent,false);assert(r.issues.some(i=>/package-lock/.test(i)));assert.equal(fs.existsSync(path.join(root,'package-lock.json')),false);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('production release is never asserted even for a valid fixture lock',()=>{const {root,writeLock}=fixture();try{writeLock();const r=check(root);assert.equal(r.ok,true,JSON.stringify(r.issues));assert.equal(r.productionApproved,false);assert.match(r.sha256,/^[a-f0-9]{64}$/);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('cannot generate without explicit authorization or while a lockfile exists',()=>{const {root,writeLock}=fixture();let called=false;const fake=()=>{called=true;return {status:0}};try{assert.throws(()=>generate(root,{},fake),/authorize/);assert.equal(called,false);writeLock();assert.throws(()=>generate(root,authorized,fake),/Existing lockfile/);assert.equal(called,false);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('authentic generation command never runs install scripts or permits unreviewed registry',()=>{const {root,writeLock}=fixture();let observed;try{
 const result=generate(root,authorized,(cmd,args,options)=>{observed={cmd,args,options};writeLock();return {status:0}});
 assert.equal(result.ok,true);assert.equal(result.generated,true);assert.equal(observed.cmd,'npm');
 assert(observed.args.includes('--package-lock-only'));assert(observed.args.includes('--ignore-scripts'));assert(observed.args.includes('--strict-peer-deps'));
 assert(observed.args.includes('--registry='+REGISTRY));assert(!observed.args.includes('--force'));assert(!observed.args.includes('--legacy-peer-deps'));
 assert.equal(observed.options.env.npm_config_ignore_scripts,'true');assert.equal(observed.options.cwd,root);assert.equal(observed.options.stdio,'inherit');
 assert(check(root).ok);
 }finally{fs.rmSync(root,{recursive:true,force:true})}});
test('a failed network/npm attempt removes only its newly created lockfile',()=>{const {root,writeLock}=fixture();try{assert.throws(()=>generate(root,authorized,()=>{writeLock();return {status:1}}),/failed/);assert.equal(fs.existsSync(path.join(root,'package-lock.json')),false);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('malicious resolved package URLs reject the generated lock, then clean the fresh output',()=>{const {root,writeLock}=fixture();try{assert.throws(()=>generate(root,authorized,()=>{writeLock({'node_modules/rogue':{version:'1.0.0',resolved:'https://untrusted.example/rogue.tgz',integrity:'sha512-'+Buffer.alloc(64).toString('base64')}});return {status:0}}),/unapproved/);assert.equal(fs.existsSync(path.join(root,'package-lock.json')),false);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('a changed workspace manifest is detected and not accepted',()=>{const {root,writeLock}=fixture();try{assert.throws(()=>generate(root,authorized,()=>{writeLock();const f=path.join(root,'apps/web/package.json');fs.writeFileSync(f,fs.readFileSync(f,'utf8')+'\n');return {status:0}}),/changed manifests/);assert.equal(fs.existsSync(path.join(root,'package-lock.json')),false);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('workspace version mismatch is rejected before any install',()=>{const {root}=fixture();let called=false;try{const f=path.join(root,'apps/web/package.json');let x=JSON.parse(fs.readFileSync(f));x.version='0.54.0';fs.writeFileSync(f,JSON.stringify(x));assert.throws(()=>generate(root,authorized,()=>{called=true;return {status:0}}),/versions must match/);assert.equal(called,false);}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('symlink lockfiles cannot be overwritten',()=>{const {root}=fixture();try{fs.symlinkSync('package.json',path.join(root,'package-lock.json'));assert.throws(()=>generate(root,authorized,()=>{throw Error('must not run')}),/Unsafe lockfile path/);assert.equal(fs.readlinkSync(path.join(root,'package-lock.json')),'package.json');}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('direct file, github and URL dependencies fail the manifest preflight',()=>{const {root}=fixture();try{const f=path.join(root,'apps/api/package.json');let x=JSON.parse(fs.readFileSync(f));x.dependencies={injected:'file:../somewhere'};fs.writeFileSync(f,JSON.stringify(x));const p=inspectProject(root);assert.equal(p.ok,false);assert(p.issues.some(i=>/direct URL|filesystem/.test(i)));}finally{fs.rmSync(root,{recursive:true,force:true})}});
test('minimum supported node engine must be enforced',()=>{for(const x of ['18.20.0','20.20.0','22.11.0'])assert.throws(()=>ensureToolchain(x),/Node.js/);for(const x of ['22.12.0','22.16.0','24.0.0'])assert.doesNotThrow(()=>ensureToolchain(x))});
test('API health version is derived from the installed package rather than pinned to an old release',()=>{const main=fs.readFileSync(path.join(ROOT,'apps/api/src/main.ts'),'utf8');assert(main.includes("resolve(__dirname,'../package.json')"));assert(main.includes('version:API_VERSION'));assert(!main.includes("version:'0.52.0'"));const root=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));for(const dir of ['apps/api','apps/web'])assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,dir,'package.json'))).version,root.version);assert.match(root.version,/^0\.\d+\.0$/)});
test('CI runs version checks and lock verification ahead of npm ci',()=>{const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');const i=ci.indexOf('npm run lockfile:check:v55'),v=ci.indexOf('npm run verify:v55'),install=ci.indexOf('run: npm ci');assert(i>=0&&v>=0&&install>=0&&i<install&&v<install)});
test('supervised release uses the batched history scanner on an explicitly selected original clone',()=>{
 const {buildSteps}=require('../release-validation-v51.cjs');const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 const without=buildSteps(pkg,{}).find(s=>s.name==='full-git-history-secret-scan');
 assert.deepEqual(without.args,['run','security:scan:v54']);
 const withRepo=buildSteps(pkg,{ASSETTRUST_HISTORY_REPO:'/home/user/original-assettrust'}).find(s=>s.name==='full-git-history-secret-scan');
 assert.deepEqual(withRepo.args,['run','security:scan:v54','--','--repo','/home/user/original-assettrust']);
});
test('evidence review can inspect git metadata from original clone without copying it into archive',()=>{
 const {verify}=require('../validation-evidence-v53.cjs');const f=fixture(),git=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-original-git-v55-'));
 try{fs.mkdirSync(path.join(git,'.git'));
  const result=verify(f.root,{historyRepo:git,checkLockfile:false});
  assert(!result.issues.some(s=>s.includes('Git repository history is missing')));
  assert.equal(result.ok,false); // No fake release approval just because .git exists.
  const missing=verify(f.root,{historyRepo:path.join(git,'no-such-repo'),checkLockfile:false});
  assert(missing.issues.some(s=>s.includes('Git repository history is missing')));
 }finally{fs.rmSync(git,{force:true,recursive:true});fs.rmSync(f.root,{force:true,recursive:true})}
});

test('production hosts may not generate or replace dependency lockfiles',()=>{const {root}=fixture();try{assert.throws(()=>generate(root,{...authorized,NODE_ENV:'production'},()=>{throw Error('must not run')}),/production runtime host/)}finally{fs.rmSync(root,{recursive:true,force:true})}});
