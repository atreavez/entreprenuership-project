'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const gate=require('../build-acceptance-v68.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v85-compile-'));
const src='apps/api/src/contexts/platform/domain/runtime-config.ts';
const result=spawnSync('tsc',['--strict','--target','ES2022','--module','CommonJS','--outDir',temp,src],{cwd:ROOT,encoding:'utf8',timeout:20000});
if(result.status!==0)throw Error('Runtime policy did not compile: '+result.stdout+' '+result.stderr);
const runtime=require(path.join(temp,'runtime-config.js'));
const MFA='399466047adf294b88475486d9daff7b4103c1a7397f2eeaccc88a70f0c2aa97';
const DOC='92b9a909f9616552a18c9268d364cc5f23f093da5d4454687e6f8e2727a6051b';
const PEPPER='f4b8a203c7d95e61a0fe39db784106cf291c0bad63e572804bfc7d158e92c03a';
const pwd='daa392f255eaaab8a476e50644bcfeaceefb9cc4a22b62ebe1f1bb6231a3eeb2';
function env(changes={}){return {NODE_ENV:'development',JWT_SECRET:pwd,MFA_ENCRYPTION_KEY:MFA,LOGIN_ABUSE_PEPPER:PEPPER,DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:DOC}),DATABASE_URL:'postgres://local:dev@127.0.0.1:5432/local_test',WEB_ORIGIN:'http://localhost:5173',...changes};}
function codes(c){return runtime.validateRuntimeConfig(env(c)).issues.map(i=>i.code);}
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v85-'));
 const items={
 'package.json':JSON.stringify({name:'assettrust-platform',version:'0.68.0'}),
 'apps/api/package.json':JSON.stringify({name:'@assettrust/api',version:'0.68.0'}),
 'apps/web/package.json':JSON.stringify({name:'@assettrust/web',version:'0.68.0'}),
 'package-lock.json':'TEST ONLY: mocked verified by injected prerequisite function',
 'apps/api/src/main.ts':'export const api = "reviewed";',
 'apps/api/sql/001_test.sql':'SELECT 1;',
 'apps/api/tsconfig.json':'{}',
 'apps/web/src/main.tsx':'export const web = "reviewed";',
 'apps/web/index.html':'<!doctype html><div id="root"></div>',
 'apps/web/vite.config.ts':'export default {}',
 'apps/web/tsconfig.json':'{}',
 'tools/secure-build.cjs':'// reviewed',
 'services/tiles.py':'# reviewed',
 'deploy/Caddyfile':'# reviewed',
 '.github/workflows/ci.yml':'# reviewed',
 'apps/api/dist/main.js':'console.log("old");',
 'apps/web/dist/index.html':'<!doctype html>old'
 };
 for(const [rel,value] of Object.entries(items)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,value);}
 return dir;
}
function clean(dir){fs.rmSync(dir,{recursive:true,force:true});}
function fakeRunner(root,mutation=null){const calls=[];return {
 calls,run:(command,args,opts)=>{
  assert.equal(command,'npm');assert.equal(opts.shell,false);
  calls.push(args.join(' '));
  if(mutation)mutation({command,args,opts,root,calls});
  if(args.join(' ')==='run build'){
   for(const rel of ['apps/api/dist/main.js','apps/web/dist/index.html'])fs.writeFileSync(path.join(root,rel),'new artifact '+Date.now());
  }
  return {status:0,stderr:'',stdout:''};
 }};}
function run(root,runner){return gate.runAcceptance({root,env:{NODE_ENV:'test',ASSETTRUST_V68_BUILD_CONFIRM:'YES'},runner,detectFn:()=>({ok:true,version:'0.68.0'}),artifactsFn:r=>gate.artifacts(r,{artifactCheck:()=>({ok:true,filesChecked:2})})});}

test('default development API binds to loopback',()=>assert.equal(runtime.apiListenHost(env()),'127.0.0.1'));
test('default production API also binds to loopback',()=>assert.equal(runtime.apiListenHost(env({NODE_ENV:'production'})),'127.0.0.1'));
test('test API cannot escape loopback even if host requested is public',()=>assert.equal(runtime.apiListenHost(env({NODE_ENV:'test',API_BIND_HOST:'0.0.0.0'})),'127.0.0.1'));
test('explicit loopback host in development passes startup validation',()=>assert.deepEqual(codes({API_BIND_HOST:'127.0.0.1'}),[]));
test('explicit localhost host in development passes startup validation',()=>assert.deepEqual(codes({API_BIND_HOST:'localhost'}),[]));
test('explicit all-interface dev bind is rejected without a separate opt-in',()=>assert.ok(codes({API_BIND_HOST:'0.0.0.0'}).includes('DEV_PUBLIC_BIND')));
test('IPv6 all-interface dev bind also requires a separate opt-in',()=>assert.ok(codes({API_BIND_HOST:'::'}).includes('DEV_PUBLIC_BIND')));
test('deliberately opted-in LAN development is allowed',()=>assert.deepEqual(codes({API_BIND_HOST:'0.0.0.0',ASSETTRUST_ALLOW_LAN_DEV:'YES'}),[]));
test('a mere TRUE/yes or production proxy marker does not opt in LAN development',()=>{
 for(const value of ['true','yes','1','YES '])assert.ok(codes({API_BIND_HOST:'0.0.0.0',ASSETTRUST_ALLOW_LAN_DEV:value}).includes('DEV_PUBLIC_BIND'));
 assert.ok(codes({API_BIND_HOST:'0.0.0.0',ASSETTRUST_PRIVATE_PROXY_NETWORK:'YES'}).includes('DEV_PUBLIC_BIND'));
});
test('production public exposure still requires a private proxy marker regardless of development opt-in',()=>{
 const e=codes({NODE_ENV:'production',API_BIND_HOST:'0.0.0.0',ASSETTRUST_ALLOW_LAN_DEV:'YES'});
 assert.ok(e.includes('PUBLIC_API_BIND'));
});
test('test API rejects LAN exposure even when development opt-in is set',()=>assert.ok(codes({NODE_ENV:'test',API_BIND_HOST:'0.0.0.0',ASSETTRUST_ALLOW_LAN_DEV:'YES'}).includes('TEST_BIND_UNSAFE')));
for(const host of ['evil.example','192.168.1.100','127.0.0.1:4000','http://127.0.0.1','localhost;rm -rf /',' 0.0.0.0 ', '']){
 test('unreviewed API_BIND_HOST is not accepted as a network target: '+JSON.stringify(host),()=>{
  if(host==='')assert.deepEqual(codes({API_BIND_HOST:host}),[]);
  else assert.ok(codes({API_BIND_HOST:host}).includes('API_BIND_HOST_INVALID'));
 });
}
test('web dev and preview scripts bind only to loopback by default',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'apps/web/package.json')));
 for(const key of ['dev','preview']){
  assert.match(pkg.scripts[key],/--host 127\.0\.0\.1/);
  assert.doesNotMatch(pkg.scripts[key],/0\.0\.0\.0/);
 }
});
test('Vite config also defaults both serving modes to loopback',()=>{
 const s=fs.readFileSync(path.join(ROOT,'apps/web/vite.config.ts'),'utf8');
 assert.match(s,/server:\s*\{host:'127\.0\.0\.1'/);
 assert.match(s,/preview:\s*\{host:'127\.0\.0\.1'/);
});
test('API bootstrap runs the checked bind policy',()=>assert.match(fs.readFileSync(path.join(ROOT,'apps/api/src/main.ts'),'utf8'),/apiListenHost\(process\.env\)/));
test('current source snapshot contains actual API, web, migrations and tools',()=>{
 const snap=gate.sourceSnapshot(ROOT);
 assert.ok(snap.files>300,'expected substantial protected source set');
 assert.match(snap.sha256,/^[a-f0-9]{64}$/);
 for(const rel of ['apps/api/src/auth.ts','apps/api/sql/001_initial.sql','apps/web/src/main.tsx','tools/build-acceptance-v68.cjs']){
  if(fs.existsSync(path.join(ROOT,rel)))assert.ok(snap.entries.some(e=>e[0]===rel),rel);
 }
});
test('source snapshot is deterministic',()=>assert.equal(gate.sourceSnapshot(ROOT).sha256,gate.sourceSnapshot(ROOT).sha256));
test('sensitive .env and generated dist paths are excluded from the source fingerprint',()=>{
 const root=fixture();try{
  const first=gate.sourceSnapshot(root);
  fs.writeFileSync(path.join(root,'.env'),'JWT_SECRET=LOCAL_UNSAFE_TEST_VALUE');
  fs.writeFileSync(path.join(root,'apps/api/dist/main.js'),'new artifact fixture');
  assert.equal(gate.sourceSnapshot(root).sha256,first.sha256);
  assert.equal(first.entries.some(e=>e[0].includes('.env')||e[0].includes('/dist/')),false);
 }finally{clean(root);}
});
test('any code change produces a different fingerprint',()=>{
 const root=fixture();try{const first=gate.sourceSnapshot(root);fs.writeFileSync(path.join(root,'apps/api/src/main.ts'),'changed');assert.notEqual(gate.sourceSnapshot(root).sha256,first.sha256);}finally{clean(root);}
});
test('symlink inserted under source tree is refused',()=>{
 const root=fixture();try{fs.symlinkSync(path.join(root,'package.json'),path.join(root,'apps/api/src/sneaky.ts'));assert.throws(()=>gate.sourceSnapshot(root),/PROTECTED_SOURCE_SYMLINK/);}finally{clean(root);}
});
test('nonregular source entries are refused',()=>{
 const root=fixture();try{const fifo=path.join(root,'apps/api/src/named-pipe');const r=spawnSync('mkfifo',[fifo]);if(r.status===0)assert.throws(()=>gate.sourceSnapshot(root),/PROTECTED_SOURCE_NONREGULAR/);}finally{clean(root);}
});
for(const rel of ['apps/api/src/main.ts','apps/web/src/main.tsx','apps/api/sql/001_test.sql','apps/api/package.json','apps/web/package.json','apps/web/vite.config.ts','tools/secure-build.cjs','services/tiles.py','deploy/Caddyfile','.github/workflows/ci.yml']){
 test('npm lifecycle mutation blocks before next command: '+rel,()=>{
  const root=fixture();try{
   const m=fakeRunner(root,({args})=>{if(args.join(' ')==='run lockfile:check:v55')fs.appendFileSync(path.join(root,rel),'malicious postinstall alteration');});
   const report=run(root,m.run);
   assert.equal(report.status,'FAILED');assert.ok(report.issues.includes('PROTECTED_SOURCE_CHANGED:lockfile'));
   assert.deepEqual(m.calls,['run lockfile:check:v55']);
   assert.equal(report.productionApproved,false);
  }finally{clean(root);}
 });
}
test('filesystem change during npm ci blocks the audit/build even if commands return success',()=>{
 const root=fixture();try{
  const m=fakeRunner(root,({args})=>{if(args.join(' ')==='ci')fs.appendFileSync(path.join(root,'apps/api/src/main.ts'),'// malicious');});
  const report=run(root,m.run);
  assert.equal(report.status,'FAILED');assert.ok(report.issues.includes('PROTECTED_SOURCE_CHANGED:install'));
  assert.deepEqual(m.calls,['run lockfile:check:v55','ci']);
 }finally{clean(root);}
});
test('filesystem changes during compilation block artifact acceptance',()=>{
 const root=fixture();try{
  const m=fakeRunner(root,({args})=>{if(args.join(' ')==='run build')fs.appendFileSync(path.join(root,'apps/web/index.html'),'<!-- inserted -->');});
  const report=run(root,m.run);
  assert.equal(report.status,'FAILED');assert.ok(report.issues.includes('PROTECTED_SOURCE_CHANGED:compile'));
 }finally{clean(root);}
});
test('untampered synthetic build can complete but never approve production',()=>{
 const root=fixture();try{
  const m=fakeRunner(root);
  const report=run(root,m.run);
  assert.equal(report.status,'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED');
  assert.match(report.sourceSnapshotSha256,/^[a-f0-9]{64}$/);
  assert.ok(report.sourceSnapshotFileCount>=14);
  assert.equal(report.databaseTested,false);assert.equal(report.productionApproved,false);
 }finally{clean(root);}
});
test('build acceptance still requires explicit opt-in and rejects production',()=>{
 assert.throws(()=>gate.runAcceptance({env:{NODE_ENV:'development'}}),/CONFIRM/);
 assert.throws(()=>gate.runAcceptance({env:{NODE_ENV:'production',ASSETTRUST_V68_BUILD_CONFIRM:'YES'}}),/non-production/);
});
test('new milestone is registered in manifest and CI before npm install',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 assert.match(pkg.scripts['verify:v85'],/tests-v85/);
 assert.ok(ci.indexOf('npm run verify:v85')>=0&&ci.indexOf('npm run verify:v85')<ci.indexOf('npm run build\n'));
});
test('migration inventory remains 27 SQL scripts',()=>assert.equal(fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(n=>/^\d+_.*\.sql$/.test(n)).length,27));
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
