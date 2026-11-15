'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const src=read('tools/e2e-pg-runtime-tenant-isolation-v58.mjs');
const ci=read('.github/workflows/ci.yml');
const {assertDbTarget,dbSteps}=require('../release-validation-v51.cjs');
const op='postgres://operator:operator-secret@127.0.0.1:5432/assettrust_ci';
const runtime='postgres://assettrust_v57_ci_runtime:runtime-secret@127.0.0.1:5432/assettrust_ci';
const valid={CI:'true',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V51_ALLOW_DATABASE_TESTS:'YES',ASSETTRUST_V51_DB_CONFIRM:'assettrust_ci',ASSETTRUST_V51_LOCAL_CONFIRM:'YES',ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'YES',ASSETTRUST_V58_SEEDED_RLS_CONFIRM:'YES',ASSETTRUST_V59_CRUD_CONFIRM:'YES',ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM:'YES',ASSETTRUST_V63_POLICY_CONFIRM:'YES',DATABASE_URL:op,ASSETTRUST_RUNTIME_DATABASE_URL:runtime};
test('releases must select the same restricted runtime role and a disposable local database before doing anything',()=>{
 const r=assertDbTarget(valid);assert.equal(r.databaseName,'assettrust_ci');
 for(const field of ['CI','NODE_ENV','ASSETTRUST_E2E_ALLOW_MUTATION','ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE','ASSETTRUST_V58_SEEDED_RLS_CONFIRM','ASSETTRUST_RUNTIME_DATABASE_URL']){
  const value=field==='ASSETTRUST_RUNTIME_DATABASE_URL'?'': 'NO';
  assert.throws(()=>assertDbTarget({...valid,[field]:value}),field);
 }
});
test('database checks cannot run against remote or wrong database despite runtime confirmation',()=>{
 for(const [field,value] of [['DATABASE_URL',op.replace('127.0.0.1','remote.example')],['ASSETTRUST_RUNTIME_DATABASE_URL',runtime.replace('assettrust_ci','assettrust_prod')],['ASSETTRUST_RUNTIME_DATABASE_URL',runtime.replace('assettrust_v57_ci_runtime','postgres')]])
  assert.throws(()=>assertDbTarget({...valid,[field]:value}),field);
});
test('live seeded contract refuses unsafe environment before dynamic pg import or connection',()=>{
 const process=spawnSync(global.process.execPath,['tools/e2e-pg-runtime-tenant-isolation-v58.mjs'],{cwd:ROOT,encoding:'utf8',timeout:5000,env:{PATH:global.process.env.PATH,CI:'false',NODE_ENV:'test'}});
 assert.notEqual(process.status,0);assert.match(process.stderr,/BLOCKED/);assert(!process.stdout.includes('ok'));
});
test('no network or database socket opens before explicit mutation/role checks',()=>{
 const guards=src.indexOf("if(process.env.CI!=='true'"),validate=src.indexOf('validateRuntimeDatabaseUrls('),dbimport=src.indexOf("await import('pg')"),connect=src.indexOf('await operator.connect()');
 assert(guards>=0&&validate>guards&&dbimport>validate&&connect>dbimport);
});
test('real runtime and operator use independently connected PostgreSQL clients and committed synthetic fixture data',()=>{
 assert(src.includes('const operator=new pg.Client('));assert(src.includes('const runtime=new pg.Client('));
 assert(src.includes('await operator.connect()'));assert(src.includes('await runtime.connect()'));
 assert(src.includes("await operator.query('COMMIT');committed.push(f)"));
});
test('each of four core tenant-protected data families is seeded and tested',()=>{
 for(const table of ['assets','verification_cases','case_evidence','documents']){
  assert(src.includes(`'${table}'`),table);
  assert(src.includes(`public.${table}`),table);
 }
 assert(src.includes('Array.from({length:2}'));assert(src.includes('for(let i=0;i<2;i++)'));
});
test('tests cover no scope, own-tenant reads, cross-tenant update/delete and invalid inserts',()=>{
 for(const marker of ['no tenant scope','own-tenant SELECT','Cross-tenant UPDATE must be invisible','Cross-tenant DELETE must be invisible','tenant RLS must reject insert','scope must not leak after transaction'])assert(src.includes(marker),marker);
 assert(src.includes("err?.code==='42501'"));
});
test('failure path rolls back runtime transaction and always attempts operator fixture cleanup',()=>{
 assert(src.includes("await runtime.query('ROLLBACK')"));assert(src.includes('for(const f of committed.reverse())'));
 assert(src.includes('await cleanupFixture(f)'));assert(src.includes('await operator.end()'));
});
test('seeded fixture cleanup deletes child rows before users and organizations',()=>{
 const cleanup=src.slice(src.indexOf('async function cleanupFixture('),src.indexOf('async function assertRejectedWrite('));
 assert(cleanup.includes("['documents','document']"));assert(cleanup.includes("['case_evidence','evidence']"));
 assert(cleanup.indexOf("DELETE FROM public.users")>cleanup.indexOf('DELETE FROM public.${table}'));
 assert(cleanup.indexOf("DELETE FROM public.organizations")>cleanup.indexOf("DELETE FROM public.users"));
});
test('CI proves restricted role before seeded RLS, and runs seeded RLS before normal HTTP tests',()=>{
 const a=ci.indexOf('run: node tools/provision-ci-runtime-role-v57.mjs'),b=ci.indexOf('run: npm run test:pg:runtime-role:v57'),c=ci.indexOf('run: npm run test:pg:runtime-tenant-isolation:v58'),d=ci.indexOf('run: npm run test:e2e:two-api:v42');
 assert(a>=0&&b>a&&c>b&&d>c);
 assert(ci.includes('ASSETTRUST_V58_SEEDED_RLS_CONFIRM: YES'));
});
test('CI verifies v58 source before npm ci and offline test batch keeps v58 checks',()=>{
 const verify=ci.indexOf('npm run verify:v58');const npmci=ci.indexOf('run: npm ci');
 assert(verify>=0&&verify<npmci);assert(ci.split('npm run verify:v58').length>=3);
});
test('supervised release planner requires the seeded RLS live test, never silently omits it',()=>{
 const pkg=JSON.parse(read('package.json'));const db=dbSteps(pkg).map(s=>s.name);
 assert(db.includes('test:pg:runtime-tenant-isolation:v58'));
 assert(db.indexOf('test:pg:runtime-tenant-isolation:v58')<db.indexOf('supervised-http-integrations'));
});
test('project and workspace versions agree and v58 commands exist',()=>{
 const versions=['package.json','apps/api/package.json','apps/web/package.json'].map(p=>JSON.parse(read(p)).version);
 assert.equal(new Set(versions).size,1);assert.match(versions[0],/^0\.(?:5[89]|[6-9]\d|\d{3,})\.0$/);
 const scripts=JSON.parse(read('package.json')).scripts;
 assert(scripts['verify:v58']&&scripts['test:pg:runtime-tenant-isolation:v58']);
});
test('local runtime provisioner never prints generated credentials as unmasked GitHub commands',()=>{
 const source=read('tools/provision-ci-runtime-role-v57.mjs');
 assert(source.includes("process.env.GITHUB_ACTIONS==='true'"));
 assert(source.includes('outputStat.isSymbolicLink()'));
 assert(source.includes('outputStat.mode&0o077'));
});
test('local role provisioning rejects world-readable credential output before trying pg connection',()=>{
 const os=require('node:os');const f=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v58-filemode-'));
 const file=path.join(f,'unsafe.env');fs.writeFileSync(file,'',{mode:0o644});fs.chmodSync(file,0o644);
 try{
  const env={PATH:process.env.PATH,NODE_ENV:'test',CI:'true',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',DATABASE_URL:op,GITHUB_ENV:file,GITHUB_ACTIONS:'false'};
  const result=spawnSync(process.execPath,['tools/provision-ci-runtime-role-v57.mjs'],{cwd:ROOT,env,encoding:'utf8',timeout:5000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/private regular file/);assert(!result.stdout.includes('::add-mask::'));
 }finally{fs.rmSync(f,{recursive:true,force:true});}
});
