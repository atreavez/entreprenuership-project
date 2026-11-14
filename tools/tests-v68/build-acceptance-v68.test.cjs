'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const gate=require('../build-acceptance-v68.cjs');
const ROOT=path.resolve(__dirname,'../..');
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v68-'));return dir;}
function createProject(dir){
 for(const [sub,name] of [['','assettrust-platform'],['apps/api','@assettrust/api'],['apps/web','@assettrust/web']]){
  const base=path.join(dir,sub);fs.mkdirSync(base,{recursive:true});
  fs.writeFileSync(path.join(base,'package.json'),JSON.stringify({name,version:'0.68.0'}));
 }
 fs.writeFileSync(path.join(dir,'package-lock.json'),'{"fake": "TEST FIXTURE ONLY"}\n');
 const api=path.join(dir,'apps/api/dist/main.js'),web=path.join(dir,'apps/web/dist/index.html');
 fs.mkdirSync(path.dirname(api),{recursive:true});fs.mkdirSync(path.dirname(web),{recursive:true});
 fs.writeFileSync(api,'console.log("fixture")\n');fs.writeFileSync(web,'<!doctype html>fixture\n');
 return dir;
}
function mockOptions(){return {lockCheck:()=>({ok:true}),sourceCheck:()=>({ok:true}),migrationCheck:()=>({hashesMatch:true,sourceCount:27,manifestCount:27}),nodeVersion:'22.16.0'};}
function clean(root){fs.rmSync(root,{recursive:true,force:true});}
function okArtifacts(root){return gate.artifacts(root,{artifactCheck:()=>({ok:true,filesChecked:2})});}
function simulateRunner(root,{fail=null,refresh=true,token=null}={}){
 const calls=[];
 const run=(command,args,opts)=>{
  calls.push([command,...args].join(' '));
  assert.equal(command,'npm');assert.equal(opts.shell,false);
  assert.deepEqual(opts.stdio,['ignore','pipe','pipe']);
  if(args[0]==='run'&&args[1]==='build'&&refresh){
   for(const rel of ['apps/api/dist/main.js','apps/web/dist/index.html']){
    const file=path.join(root,rel);fs.writeFileSync(file,'fresh v68 compiled fixture '+Date.now());
   }
  }
  return fail===args.join(' ')?{status:4,stderr:token||'known simulated failure',stdout:''}:{status:0,stderr:'',stdout:''};
 };
 return {run,calls};
}

test('v0.68 version is consistent across all workspaces',()=>{
 const p=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 assert.equal(p.version,JSON.parse(fs.readFileSync(path.join(ROOT,'apps/api/package.json'))).version);
 assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,'apps/api/package.json'))).version,p.version);
 assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,'apps/web/package.json'))).version,p.version);
});
test('modern supported Node recognized; older minor and majors fail',()=>{
 for(const v of ['22.12.0','22.16.0','24.0.0'])assert.equal(gate.nodeSupported(v),true);
 for(const v of ['20.20.0','22.11.9','invalid','22.12.0-dev',''])assert.equal(gate.nodeSupported(v),false);
});
test('read-only inspection fails closed on missing genuine lockfile',()=>{
 const root=createProject(temp());try{
  fs.unlinkSync(path.join(root,'package-lock.json'));
  const result=gate.detect(root,mockOptions());
  assert.equal(result.ok,false);
  assert.ok(result.issues.includes('AUTHENTIC_REVIEWED_LOCKFILE_REQUIRED'));
  assert.equal(result.checks.sqlMigrationsVerified,true);
  assert.equal(result.productionApproved,false);
 }finally{clean(root);}
});
test('independent fixtures with verified sources and lockfile can pass prerequisites',()=>{
 const root=createProject(temp());try{
  const result=gate.detect(root,mockOptions());assert.equal(result.ok,true);assert.equal(result.productionApproved,false);
 }finally{clean(root);}
});
test('workspace version mismatch blocks build',()=>{
 const root=createProject(temp());try{
  fs.writeFileSync(path.join(root,'apps/api/package.json'),JSON.stringify({name:'@assettrust/api',version:'0.66.0'}));
  assert.ok(gate.detect(root,mockOptions()).issues.includes('PACKAGE_VERSION_INCONSISTENT'));
 }finally{clean(root);}
});
test('mismatched migration count blocks acceptance even if hashes otherwise match',()=>{
 const root=createProject(temp());try{
  const opts={...mockOptions(),migrationCheck:()=>({hashesMatch:true,sourceCount:26,manifestCount:26})};
  assert.ok(gate.detect(root,opts).issues.includes('SOURCE_MIGRATIONS_UNVERIFIED'));
 }finally{clean(root);}
});
test('bad import source check blocks acceptance',()=>{
 const root=createProject(temp());try{
  assert.ok(gate.detect(root,{...mockOptions(),sourceCheck:()=>({ok:false})}).issues.includes('SOURCE_ENTRY_OR_IMPORTS_INVALID'));
 }finally{clean(root);}
});
test('built artifacts are checked and cryptographic hashes recorded',()=>{
 const root=createProject(temp());try{
  const result=okArtifacts(root);assert.equal(result.ok,true);assert.match(result.entries['apps/api/dist/main.js'].sha256,/^[0-9a-f]{64}$/);
  assert.ok(result.entries['apps/web/dist/index.html'].bytes>0);
 }finally{clean(root);}
});
test('missing or linked artifacts are rejected',()=>{
 const root=createProject(temp());try{
  const f=path.join(root,'apps/api/dist/main.js');fs.unlinkSync(f);assert.equal(okArtifacts(root).ok,false);
  fs.symlinkSync(path.join(root,'apps/web/dist/index.html'),f);assert.equal(okArtifacts(root).ok,false);
 }finally{clean(root);}
});
test('artifact inspection does not certify release or fresh build',()=>{
 const root=createProject(temp());try{
  const result=gate.verifyArtifacts(root,{...mockOptions(),artifactCheck:()=>({ok:true,filesChecked:2})});
  assert.equal(result.ok,true);assert.equal(result.productionApproved,false);assert.match(result.notes,/not evidence/);
 }finally{clean(root);}
});
test('running without explicit opt-in is forbidden',()=>{
 assert.throws(()=>gate.runAcceptance({env:{NODE_ENV:'test'}}),/ASSETTRUST_V68_BUILD_CONFIRM/);
});
test('production-mode build acceptance is forbidden even with opt-in',()=>{
 assert.throws(()=>gate.runAcceptance({env:{NODE_ENV:'production',ASSETTRUST_V68_BUILD_CONFIRM:'YES'}}),/non-production/);
});
test('missing prerequisites short-circuit before launching npm',()=>{
 const root=createProject(temp());try{
  let invoked=false;
  const result=gate.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},detectFn:()=>({ok:false,version:'0.68.0'}),runner:()=>{invoked=true;}});
  assert.equal(result.status,'BLOCKED');assert.equal(invoked,false);assert.deepEqual(result.steps,[]);
 }finally{clean(root);}
});
test('a failed npm command stops execution immediately and identifies first failure',()=>{
 const root=createProject(temp());try{
  const {run,calls}=simulateRunner(root,{fail:'ci'});
  const result=gate.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},detectFn:()=>({ok:true,version:'0.68.0'}),runner:run});
  assert.equal(result.status,'FAILED');assert.equal(result.firstFailure.step,'install');assert.equal(calls.length,2);
  assert.equal(result.productionApproved,false);
 }finally{clean(root);}
});
test('npm lifecycle mutation of the reviewed lockfile aborts acceptance',()=>{
 const root=createProject(temp());try{
  const {run,calls}=simulateRunner(root);
  const mutating=(command,args,opts)=>{const result=run(command,args,opts);
   if(args.join(' ')==='ci')fs.writeFileSync(path.join(root,'package-lock.json'),'changed during npm ci');
   return result;};
  const result=gate.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},detectFn:()=>({ok:true,version:'0.68.0'}),runner:mutating});
  assert.equal(result.status,'FAILED');assert.ok(result.issues.includes('SOURCE_MANIFEST_OR_LOCKFILE_CHANGED:install'));
  assert.equal(calls.length,2);
 }finally{clean(root);}
});
test('stderr/credentials never emerge in console report and are masked in private evidence',()=>{
 const root=createProject(temp());try{
  const secret='LONG_UNSAFE_PASSWORD_SECRET';
  const {run}=simulateRunner(root,{fail:'ci',token:'error: JWT_SECRET='+secret+' and '+secret});
  const env={ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test',JWT_SECRET:secret};
  const result=gate.runAcceptance({root,env,detectFn:()=>({ok:true,version:'0.68.0'}),runner:run});
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.match(result.firstFailure.redactedExcerpt,/REDACTED/);
 }finally{clean(root);}
});
test('npm install and build children do not inherit database URLs or authentication credentials',()=>{
 const env={NODE_ENV:'test',PATH:'/bin',DATABASE_URL:'postgres://unsafe:password@server/test',
  ASSETTRUST_RUNTIME_DATABASE_URL:'postgres://unsafe:password@server/test',
  JWT_SECRET:'any-long-unsafe-credential',API_KEY:'unsafe',LOGIN_ABUSE_PEPPER:'unsafe',
  ASSETTRUST_V68_BUILD_CONFIRM:'YES'};
 const isolated=gate.isolatedBuildEnv(env);
 assert.equal(isolated.PATH,'/bin');assert.equal(isolated.NODE_ENV,'test');
 for(const name of ['DATABASE_URL','ASSETTRUST_RUNTIME_DATABASE_URL','JWT_SECRET','API_KEY','LOGIN_ABUSE_PEPPER','ASSETTRUST_V68_BUILD_CONFIRM'])assert.equal(isolated[name],undefined);
});
test('reported success requires successful install, audit, build and milestone regression',()=>{
 const root=createProject(temp());try{
  const {run,calls}=simulateRunner(root);
  const result=gate.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},detectFn:()=>({ok:true,version:'0.68.0'}),runner:run,artifactsFn:okArtifacts});
  assert.equal(result.status,'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED');assert.equal(calls.length,6);
  assert.equal(result.productionApproved,false);assert.equal(result.databaseTested,false);
  assert.equal(result.artifacts.ok,true);
 }finally{clean(root);}
});
test('stale API/web build files cannot satisfy a successful-looking compile',()=>{
 const root=createProject(temp());try{
  const earlier=new Date(Date.now()-120000);
  for(const rel of ['apps/api/dist/main.js','apps/web/dist/index.html'])fs.utimesSync(path.join(root,rel),earlier,earlier);
  const {run,calls}=simulateRunner(root,{refresh:false});
  const result=gate.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},detectFn:()=>({ok:true,version:'0.68.0'}),runner:run,artifactsFn:okArtifacts});
  assert.equal(result.status,'FAILED');assert.ok(result.issues.includes('STALE_ARTIFACT_AFTER_COMPILE'));
  assert.equal(calls.length,4);
 }finally{clean(root);}
});
test('a failed postcompile artifact policy is a hard failure',()=>{
 const root=createProject(temp());try{
  const {run}=simulateRunner(root);
  const result=gate.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},detectFn:()=>({ok:true,version:'0.68.0'}),runner:run,artifactsFn:()=>({ok:false,entries:{}})});
  assert.equal(result.status,'FAILED');assert.ok(result.issues.includes('POST_COMPILE_ARTIFACT_POLICY_FAILED'));
 }finally{clean(root);}
});
test('evidence uses private 0600 file with non-approving status',()=>{
 const root=createProject(temp());try{
  const rel=gate.writeEvidence(root,{status:'BLOCKED',productionApproved:false});
  const f=path.join(root,rel);assert.equal(fs.statSync(f).mode&0o777,0o600);
  assert.equal(JSON.parse(fs.readFileSync(f)).productionApproved,false);
 }finally{clean(root);}
});
test('evidence refuses symlinked output files',()=>{
 const root=createProject(temp());try{
  const r=path.join(root,'test-evidence/v68');fs.mkdirSync(r,{recursive:true});
  const victim=path.join(root,'sentinel.txt');fs.writeFileSync(victim,'original');
  fs.symlinkSync(victim,path.join(r,'build-acceptance.json'));
  assert.throws(()=>gate.writeEvidence(root,{ok:true}),/Unsafe evidence target/);
  assert.equal(fs.readFileSync(victim,'utf8'),'original');
 }finally{clean(root);}
});
test('plan discloses ordered commands but never triggers npm',()=>{
 const p=gate.plan();assert.equal(p.steps.length,6);
 assert.equal(p.steps[1].command,'npm ci');assert.equal(p.productionApproved,false);
});
test('CI executes v0.68 suite and checks compiled artifacts after npm run build',()=>{
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 assert.match(ci,/npm run verify:v68/);
 assert.ok(ci.indexOf('npm run build:acceptance:artifacts:v68')>ci.indexOf('npm run build\n'));
});
test('CLI inspection reports actual prerequisites without claiming acceptance',()=>{
 const out=cp.spawnSync(process.execPath,['tools/build-acceptance-v68.cjs','--inspect'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(out.error,undefined);
 const body=JSON.parse(out.stdout);
 assert.equal(body.productionApproved,false);
 assert.equal(out.status,body.ok?0:1);
 assert.equal(body.checks.reviewedLockfileValid,!body.issues.includes('AUTHENTIC_REVIEWED_LOCKFILE_REQUIRED'));
});
