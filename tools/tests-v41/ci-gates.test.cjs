'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const {validateCi}=require('../ci-completeness-v41.cjs');
const {assertDisposableContractEnvironment,makeSchemaName,quoteControlledSchema}=require('../two-client-policy-v41.cjs');
const {inspect}=require('../release-readiness-v41.cjs');
const yaml=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const good={NODE_ENV:'test',CI:'true',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V41_CONCURRENCY_CONTRACT:'YES',DATABASE_URL:'postgres://test:pass@127.0.0.1:5432/assettrust_ci'};
test('CI now includes every declared offline version suite and disposable PostgreSQL contract',()=>{
 const result=validateCi({workflow:yaml,manifest});assert(result.ok,result.issues.join('; '));assert(result.versionSuiteCount>=39);assert(result.pgContractCount>=17);
});
test('CI contract fails closed if a future version check is omitted',()=>{
 const last=Math.max(...Object.keys(manifest.scripts).filter(s=>/^verify:v\d{2}$/.test(s)).map(s=>Number(s.slice(-2))));
 const next=`verify:v${String(last+1).padStart(2,'0')}`;
 const bad={...manifest,scripts:{...manifest.scripts,[next]:`node --test tools/tests-v${last+1}/*.test.cjs`}};
 const r=validateCi({workflow:yaml,manifest:bad});assert(!r.ok);assert(r.issues.some(s=>s.includes(next)));
});
test('CI contract rejects omission of a live SQL gate',()=>{
 const edited=yaml.replace('npm run test:pg:attempts:v40','echo skipped-attempts-v40');const r=validateCi({workflow:edited,manifest});
 assert(!r.ok);assert(r.issues.some(s=>s.includes('test:pg:attempts:v40')));
});
test('CI contract rejects ignored failures, fallback installers, and missing npm ci',()=>{
 for(const bad of [yaml+'\ncontinue-on-error: true\n',yaml+'\nrun: echo ok || true\n',yaml.replace('run: npm ci','run: npm install')]){
  const r=validateCi({workflow:bad,manifest});assert(!r.ok,'Must flag forbidden CI variant');
 }
});
test('two-session PostgreSQL contract refuses missing consent or production/nonlocal DB',()=>{
 assert.equal(assertDisposableContractEnvironment(good).databaseName,'assettrust_ci');
 for(const e of [{...good,ASSETTRUST_E2E_ALLOW_MUTATION:'NO'},{...good,ASSETTRUST_V41_CONCURRENCY_CONTRACT:'NO'},{...good,NODE_ENV:'production'},{...good,CI:'false'},{...good,DATABASE_URL:'postgres://test:pass@10.0.0.10:5432/assettrust_ci'},{...good,DATABASE_URL:'postgres://test:pass@127.0.0.1:5432/assettrust'},{...good,DATABASE_URL:'postgres://test:pass@127.0.0.1:5432/assettrust_ci?sslmode=disable'}])assert.throws(()=>assertDisposableContractEnvironment(e));
});
test('untrusted schema identifiers cannot be interpolated into DDL',()=>{
 const name=makeSchemaName(()=>Buffer.alloc(12,0x1));assert.equal(quoteControlledSchema(name),`"${name}"`);
 for(const bad of ['public','assettrust_v41_test_hello','assettrust_v41_test_111111111111111111111111";DROP SCHEMA public;--'])assert.throws(()=>quoteControlledSchema(bad));
});
test('read-only release inspection reports incomplete local gates but never production approval',()=>{
 const result=inspect(ROOT,{env:{CI:'false'}});assert.equal(result.productionApproved,false);
 assert.equal(result.checks.find(x=>x.name==='ci-coverage-contract').pass,true);
 assert.equal(result.checks.find(x=>x.name==='migration-source-fingerprints').pass,true);
 assert.equal(result.checks.find(x=>x.name==='reviewed-lockfile-graph').pass,false);
 assert(result.unverified.some(x=>/browser/.test(x)));
});
test('preflight has no mutation side effects on an empty directory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v41-gates-'));try{
  const before=fs.readdirSync(dir);const p=inspect(dir);assert.equal(p.productionApproved,false);assert.equal(p.prerequisitesPass,false);assert.deepEqual(fs.readdirSync(dir),before);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('two-session runner uses exact SQL migration, never touches production tables and fails before importing pg',()=>{
 const source=fs.readFileSync(path.join(ROOT,'tools/e2e-pg-shared-counter-v41.mjs'),'utf8');
 assert(source.includes('assertDisposableContractEnvironment(process.env)'));
 assert(source.indexOf('assertDisposableContractEnvironment(process.env)')<source.indexOf("import('pg')"));
 assert(source.includes('018_recipient_attempt_windows.sql'));
 assert(source.includes('DROP SCHEMA'));
 assert(source.includes('Promise.all'));
});
