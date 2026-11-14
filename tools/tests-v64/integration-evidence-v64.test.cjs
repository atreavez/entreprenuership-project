'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const tool=require('../integration-evidence-v64.cjs');
const repo=path.resolve(__dirname,'../..');
function fakeRepo(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v64-'));
 for(const f of ['apps/api','apps/web'])fs.mkdirSync(path.join(dir,f),{recursive:true});
 for(const f of ['apps/api/package.json','apps/web/package.json'])fs.writeFileSync(path.join(dir,f),'{}');
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'assettrust-platform',version:'0.64.0',scripts:{'release:validate:v51':'x','release:database:v51':'x'}}));
 return dir;
}
function lock(dir){fs.writeFileSync(path.join(dir,'package-lock.json'),'{}');}
const safeEnv={DATABASE_URL:'postgres://admin:password@127.0.0.1:5432/assettrust_test',ASSETTRUST_RUNTIME_DATABASE_URL:'postgres://assettrust_v57_ci_runtime:secret@127.0.0.1:5432/assettrust_test'};
test('v64 exact mode parse: refuses extra arguments and unknown modes',()=>{
 assert.equal(tool.parseMode(['--plan']),'--plan');
 assert.throws(()=>tool.parseMode([]));assert.throws(()=>tool.parseMode(['--database','--plan']));
 assert.throws(()=>tool.parseMode(['--production']));
});
test('plan is side-effect free and never grants production approval',()=>{
 const r=tool.execute('--plan',{root:'/missing'});
 assert.equal(r.status,'PLAN_ONLY');assert.equal(r.productionApproved,false);assert.equal(r.steps.length,2);
});
test('inspection identifies missing authentic lockfile and real builds',()=>{
 const r=tool.inspect(repo,{});assert.equal(r.productionApproved,false);assert.equal(typeof r.sourceManifestSha256,'string');
 assert.equal(r.checks.genuineLockfilePresent,false);
});
test('incompatible manifest is rejected before trying to run external commands',()=>{
 const d=fakeRepo();fs.writeFileSync(path.join(d,'package.json'),'{}');
 assert.throws(()=>tool.inspect(d,{}));fs.rmSync(d,{recursive:true,force:true});
});
test('missing lockfile prevents spawn, leaving no evidence file',()=>{
 const d=fakeRepo();let called=false;
 const r=tool.execute('--build',{root:d,runner:()=>{called=true;}});
 assert.equal(r.status,'BLOCKED');assert.equal(called,false);assert.equal(fs.existsSync(tool.evidenceFile(d)),false);
 fs.rmSync(d,{recursive:true,force:true});
});
test('database mode is blocked absent actual compiled apps, even with a lockfile',()=>{
 const d=fakeRepo();lock(d);let called=false;
 const r=tool.execute('--database',{root:d,env:safeEnv,runner:()=>{called=true;}});
 assert.equal(r.status,'BLOCKED');assert.equal(called,false);
 fs.rmSync(d,{recursive:true,force:true});
});
test('database confirmation does not accept operator/runtime credentials of same role',()=>{
 const d=fakeRepo();lock(d);fs.mkdirSync(path.join(d,'apps/api/dist'),{recursive:true});fs.mkdirSync(path.join(d,'apps/web/dist'),{recursive:true});
 fs.writeFileSync(path.join(d,'apps/api/dist/main.js'),'');fs.writeFileSync(path.join(d,'apps/web/dist/index.html'),'');
 assert.throws(()=>tool.authorizeDatabase(d,{...safeEnv,ASSETTRUST_RUNTIME_DATABASE_URL:safeEnv.DATABASE_URL}));
 fs.rmSync(d,{recursive:true,force:true});
});
test('missing v64 explicit db authorization is refused',()=>{
 const d=fakeRepo();lock(d);fs.mkdirSync(path.join(d,'apps/api/dist'),{recursive:true});fs.mkdirSync(path.join(d,'apps/web/dist'),{recursive:true});
 fs.writeFileSync(path.join(d,'apps/api/dist/main.js'),'');fs.writeFileSync(path.join(d,'apps/web/dist/index.html'),'');
 assert.throws(()=>tool.authorizeDatabase(d,{...safeEnv}));
 fs.rmSync(d,{recursive:true,force:true});
});
test('captured evidence removes passwords, tokens, and database URLs',()=>{
 const env={JWT_SECRET:'super-secret-token',DATABASE_URL:safeEnv.DATABASE_URL};
 const out=tool.safeExcerpt(`JWT_SECRET=super-secret-token ${safeEnv.DATABASE_URL} Authorization: Bearer abc123456`,env);
 assert.doesNotMatch(out,/super-secret-token|postgres:\/\/admin|abc123456/);
});
test('successful mock invocation is labeled evidence not production release',()=>{
 const d=fakeRepo();lock(d);
 const r=tool.execute('--build',{root:d,runner:()=>({status:0,stdout:'ok',stderr:''})});
 assert.equal(r.status,'INTEGRATION_COMMANDS_PASSED_RELEASE_STILL_BLOCKED');
 assert.equal(r.productionApproved,false);assert.equal(r.steps[0].passed,true);
 assert.equal(fs.statSync(tool.evidenceFile(d)).mode&0o777,0o600);
 fs.rmSync(d,{recursive:true,force:true});
});
test('nonzero subprocess fails closed with local sanitized excerpt',()=>{
 const d=fakeRepo();lock(d);
 const r=tool.execute('--build',{root:d,env:{JWT_SECRET:'super-secret-token'},runner:()=>({status:1,stdout:'JWT_SECRET=super-secret-token',stderr:'failed'})});
 assert.equal(r.status,'FAILED');assert.equal(r.steps.length,1);
 assert.doesNotMatch(fs.readFileSync(tool.evidenceFile(d),'utf8'),/super-secret-token/);
 fs.rmSync(d,{recursive:true,force:true});
});
test('linked evidence directory cannot be followed',()=>{
 const d=fakeRepo();lock(d);const out=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-target-'));
 fs.symlinkSync(out,path.join(d,'test-evidence'));
 assert.throws(()=>tool.execute('--build',{root:d,runner:()=>({status:0})}),/unsafe evidence/);
 assert.equal(fs.readdirSync(out).length,0);
 fs.rmSync(d,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true});
});
test('linked lockfile is not treated as genuine',()=>{
 const d=fakeRepo();fs.symlinkSync('package.json',path.join(d,'package-lock.json'));
 assert.equal(tool.inspect(d,{}).checks.genuineLockfilePresent,false);
 fs.rmSync(d,{recursive:true,force:true});
});

test('repeated successful runs update regular evidence file without changing release status',()=>{
 const d=fakeRepo();lock(d);
 tool.execute('--build',{root:d,runner:()=>({status:0})});
 const out=tool.execute('--build',{root:d,runner:()=>({status:0})});
 assert.equal(out.productionApproved,false);
 assert.equal(out.status,'INTEGRATION_COMMANDS_PASSED_RELEASE_STILL_BLOCKED');
 fs.rmSync(d,{recursive:true,force:true});
});
test('--all performs build first, then refuses unconfirmed database without running database script',()=>{
 const d=fakeRepo();lock(d);let runs=0;
 const out=tool.execute('--all',{root:d,env:safeEnv,runner:()=>{runs++;return {status:0};}});
 assert.equal(runs,1);assert.equal(out.status,'BLOCKED');assert.equal(out.steps.length,1);
 fs.rmSync(d,{recursive:true,force:true});
});
