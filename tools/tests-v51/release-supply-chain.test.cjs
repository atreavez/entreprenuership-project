'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const root=path.resolve(__dirname,'../..');
const {specRisk,auditManifest,auditLockedUrls,audit}=require('../supply-chain-policy-v51.cjs');
const {parseMode,assertDbTarget,buildSteps,dbSteps,prepare,execute}=require('../release-validation-v51.cjs');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function testProject({validLock=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v51-fixture-'));
 fs.mkdirSync(path.join(dir,'apps','api'),{recursive:true});fs.mkdirSync(path.join(dir,'apps','web'),{recursive:true});
 const manifest={name:'assettrust-test',version:'0.51.0',workspaces:['apps/api','apps/web'],scripts:{'verify:v03':'node -v','test:pg:sample:v51':'node -v'}};
 const api={name:'@assettrust/api',version:'0.51.0',dependencies:{}};
 const web={name:'@assettrust/web',version:'0.51.0',dependencies:{}};
 for(const [f,x] of [['package.json',manifest],['apps/api/package.json',api],['apps/web/package.json',web]])fs.writeFileSync(path.join(dir,f),JSON.stringify(x));
 if(validLock){
  const lock={name:manifest.name,version:manifest.version,lockfileVersion:3,packages:{
   '':{name:manifest.name,version:manifest.version,workspaces:manifest.workspaces},
   'apps/api':api,'apps/web':web,
   'node_modules/@assettrust/api':{resolved:'apps/api',link:true},
   'node_modules/@assettrust/web':{resolved:'apps/web',link:true}
  }};
  fs.writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify(lock));
 }
 return dir;
}
const authorized={CI:'true',ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'YES',ASSETTRUST_V58_SEEDED_RLS_CONFIRM:'YES',ASSETTRUST_V59_CRUD_CONFIRM:'YES',ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM:'YES',ASSETTRUST_V63_POLICY_CONFIRM:'YES',ASSETTRUST_RUNTIME_DATABASE_URL:'postgres://assettrust_v57_ci_runtime:runtime-secret@localhost:5432/assettrust_ci',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V51_ALLOW_DATABASE_TESTS:'YES',ASSETTRUST_V51_DB_CONFIRM:'assettrust_ci',ASSETTRUST_V51_LOCAL_CONFIRM:'YES',DATABASE_URL:'postgres://test:secret@localhost:5432/assettrust_ci'};
test('direct Git, local file, remote script and insecure dependency specifiers rejected',()=>{
 for(const s of ['git+https://evil.example/x','file:../injected','https://evil.example/package.tgz','http://evil.example/x','../../other','github:user/repo','ssh://bad'])assert(specRisk(s));
 for(const s of ['^11.0.0','~8.0.0','1.2.3','npm:@scope/approved@^2.0.0'])assert.equal(specRisk(s),null);
 const failures=auditManifest({dependencies:{bad:'file:../private',good:'^1.0.0'}});assert.equal(failures.length,1);
});
test('only allow explicitly trusted https registry tarballs, no credentials, redirects or private endpoint',()=>{
 const inspect=lock=>auditLockedUrls({lockfileVersion:3,packages:{'':{},'node_modules/example':{resolved:lock}}});
 assert.equal(inspect('https://registry.npmjs.org/example/-/example-1.0.0.tgz').issues.length,0);
 for(const url of ['http://registry.npmjs.org/x','https://evil.example/x','https://user:pass@registry.npmjs.org/x','https://registry.npmjs.org/x?token=hidden','file:../x','https://registry.npmjs.org/x#cred'])assert.equal(inspect(url).issues.length,1,url);
});
test('missing authentic npm lockfile blocks supply chain verification',()=>{
 const result=audit(testProject());
 assert.equal(result.ok,false);
 assert(result.issues.some(i=>/package-lock|lockfile/i.test(i)));
 assert.equal(result.reviewRequired.registryTarballsChecked,0);
});
test('release modes reject unknown and combined options',()=>{
 for(const bad of [[],['--no-check'],['--full','--database'],['--plan','--validate']])assert.throws(()=>parseMode(bad));
 for(const mode of ['--plan','--preflight','--validate','--database','--full'])assert.equal(parseMode([mode]),mode);
});
test('disposable database requires exact local target, explicit approvals and matching name',()=>{
 const r=assertDbTarget(authorized);assert.equal(r.databaseName,'assettrust_ci');
 for(const [key,value] of [['NODE_ENV','production'],['ASSETTRUST_E2E_ALLOW_MUTATION','NO'],['ASSETTRUST_V51_ALLOW_DATABASE_TESTS','NO'],['ASSETTRUST_V51_DB_CONFIRM','other_ci'],['DATABASE_URL','postgres://test@remote.example/assettrust_ci'],['DATABASE_URL','postgres://test@localhost/assettrust_prod'],['DATABASE_URL','postgres://test@localhost/assettrust_ci?options=-csearch_path%3Dpublic']]){
  assert.throws(()=>assertDbTarget({...authorized,[key]:value}),`${key} must fail`);
 }
 assert.throws(()=>assertDbTarget({...authorized,CI:'false',ASSETTRUST_V51_LOCAL_CONFIRM:'NO'}));
 for(const overrides of [{CI:'false'},{ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'NO'},{ASSETTRUST_V58_SEEDED_RLS_CONFIRM:'NO'},{ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM:'NO'},{ASSETTRUST_RUNTIME_DATABASE_URL:undefined}]) assert.throws(()=>assertDbTarget({...authorized,...overrides}),'v58 restricted runtime safety preconditions must not be bypassed');
});
test('supervised build always runs verified lockfile install, dependency audit, all version suites and secret history',()=>{
 const pkg=JSON.parse(read('package.json')),steps=buildSteps(pkg).map(x=>x.name);
 assert.equal(steps[0],'npm-ci');assert.equal(steps[1],'npm-audit-production');
 for(const n of ['verify:v03','verify:v50','verify:v51','verify:ci:v41','verify:architecture','verify:syntax','api-unit-tests','api-and-web-build','full-git-history-secret-scan'])assert(steps.includes(n),n);
 assert(!steps.some(s=>/install-only|audit-fix/.test(s)));
});
test('supervised database plan includes actual migrations and all PostgreSQL contracts',()=>{
 const pkg=JSON.parse(read('package.json')),steps=dbSteps(pkg).map(x=>x.name);
 assert.deepEqual(steps.slice(0,2),['migrate-disposable-database','migration-immutability-check']);
 const expected=Object.keys(pkg.scripts).filter(x=>x.startsWith('test:pg:'));
 for(const s of expected)assert(steps.includes(s),s);
 assert.equal(steps.length,expected.length+4);
 assert(steps.includes('two-real-api-instances'));assert(steps.includes('supervised-http-integrations'));
});
test('plan is read-only even if database is missing and does not write a local evidence file',()=>{
 const dir=testProject();const dest=path.join(dir,'test-evidence/v51/local-validation-summary.json');
 const r=execute(dir,'--plan',{});assert.equal(r.status,'PLAN_ONLY');assert.equal(r.productionApproved,false);
 assert(!fs.existsSync(dest));
});
test('failed preflight performs no npm or database actions and never reports success',()=>{
 let called=0;const fake=()=>{called++;return {status:0}};
 const out=execute(testProject(),'--full',authorized,fake);
 assert.equal(out.status,'BLOCKED');assert.equal(called,0);assert.equal(out.productionApproved,false);
 assert(!fs.existsSync(path.join(root,'test-evidence/v51/local-validation-summary.json')));
});
test('database-only mode rejects an unsafe DB before any action despite missing lockfile',()=>{
 let called=0;const out=execute(root,'--database',{...authorized,DATABASE_URL:'postgres://x@db.example/assettrust_ci'},()=>{called++;return {status:0}});
 assert.equal(out.status,'BLOCKED');assert.equal(called,0);assert(out.issues.some(i=>/loopback/i.test(i)));
});
test('preflight marks missing lockfile as blocked and is read-only',()=>{
 const dir=testProject();const pre=prepare(dir,{},'--preflight');assert.equal(pre.ok,false);
 const out=execute(dir,'--preflight',{});assert.equal(out.status,'BLOCKED');assert.equal(out.productionApproved,false);
});
test('CI includes all v51 checks without bypassing npm ci',()=>{
 const ci=read('.github/workflows/ci.yml');const pkg=JSON.parse(read('package.json'));
 assert(Number(pkg.version.split('.')[1])>=51,'version must not regress below v0.51');assert.equal(JSON.parse(read('apps/api/package.json')).version,pkg.version);assert.equal(JSON.parse(read('apps/web/package.json')).version,pkg.version);
 assert(ci.includes('npm run verify:v51'));assert(ci.includes('npm run release:plan:v51'));assert(ci.includes('npm run supply-chain:v51'));
 assert(ci.includes('run: npm ci'));assert(!ci.includes('continue-on-error: true'));
 assert(require('../ci-completeness-v41.cjs').validateCi().ok);
});
test('synthetic fixture can satisfy static graph checks without shipping a fabricated project lockfile',()=>{
 const dir=testProject({validLock:true});const r=audit(dir);
 assert.equal(r.ok,true,JSON.stringify(r.issues));assert.equal(r.reviewRequired.registryTarballsChecked,0);
});
test('supervised build records success in a sanitized JSON evidence file but never approves production',()=>{
 const dir=testProject({validLock:true});const calls=[];
 const fake=(bin,args)=>{calls.push({bin,args});return {status:0,signal:null,error:null}};
 const out=execute(dir,'--validate',{DATABASE_URL:'postgres://sensitive@localhost/assettrust_ci'},fake);
 assert.equal(out.status,'VALIDATION_STEPS_PASSED_NOT_RELEASE_APPROVAL');
 assert.equal(out.productionApproved,false);assert(calls.length>4);
 const text=fs.readFileSync(path.join(dir,'test-evidence/v51/local-validation-summary.json'),'utf8');
 assert(!text.includes('sensitive'));assert(text.includes('full-git-history-secret-scan'));
});
test('supervised run halts on first child-process failure and records explicit failure',()=>{
 const dir=testProject({validLock:true});let calls=0;
 const out=execute(dir,'--validate',{},()=>({status:++calls===2?1:0}));
 assert.equal(out.status,'FAILED');assert.equal(calls,2);assert.equal(out.steps.length,2);
 assert.equal(out.productionApproved,false);
});
test('database execution requires safety confirmation and records its own plan',()=>{
 const dir=testProject({validLock:true});const calls=[];
 const out=execute(dir,'--database',authorized,(bin,args)=>{calls.push(args);return {status:0}});
 assert.equal(out.status,'VALIDATION_STEPS_PASSED_NOT_RELEASE_APPROVAL');
 assert.deepEqual(calls[0],['run','db:migrate']);assert(calls.some(args=>args.includes('test:pg:sample:v51')));
});
test('release runner never logs full environment, passwords or database connection strings in the summary',()=>{
 const s=read('tools/release-validation-v51.cjs');assert(s.includes('productionApproved:false'));
 assert(!/JSON\.stringify\(\s*env\s*\)/.test(s));
 assert(s.includes('summaryPath:'));assert(s.includes('flag:\'w\''));
});
