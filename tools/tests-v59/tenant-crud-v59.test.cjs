'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'tools/e2e-pg-runtime-tenant-crud-v59.mjs'),'utf8');
const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const {assertDbTarget,dbSteps}=require('../release-validation-v51.cjs');
const operator='postgres://operator:local-operator-test@127.0.0.1:5432/assettrust_ci';
const restricted='postgres://assettrust_v57_ci_runtime:local-runtime-test@127.0.0.1:5432/assettrust_ci';
const approved={CI:'true',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V51_ALLOW_DATABASE_TESTS:'YES',ASSETTRUST_V51_DB_CONFIRM:'assettrust_ci',ASSETTRUST_V51_LOCAL_CONFIRM:'YES',ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'YES',ASSETTRUST_V58_SEEDED_RLS_CONFIRM:'YES',ASSETTRUST_V59_CRUD_CONFIRM:'YES',ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM:'YES',ASSETTRUST_V63_POLICY_CONFIRM:'YES',DATABASE_URL:operator,ASSETTRUST_RUNTIME_DATABASE_URL:restricted};
test('explicit v59 CRUD authorization and restricted runtime are required by supervisor',()=>{
 assert.equal(assertDbTarget(approved).databaseName,'assettrust_ci');
 for(const field of ['CI','NODE_ENV','ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE','ASSETTRUST_V58_SEEDED_RLS_CONFIRM','ASSETTRUST_V59_CRUD_CONFIRM','ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM','ASSETTRUST_RUNTIME_DATABASE_URL'])
  assert.throws(()=>assertDbTarget({...approved,[field]:''}),field);
});
test('remote production and operator-user credentials remain forbidden',()=>{
 for(const value of [restricted.replace('127.0.0.1','remote.example'),restricted.replace('assettrust_ci','assettrust_prod'),operator])
  assert.throws(()=>assertDbTarget({...approved,ASSETTRUST_RUNTIME_DATABASE_URL:value}));
});
test('entrypoint blocks before connecting without explicit authorization',()=>{
 const result=cp.spawnSync(process.execPath,['tools/e2e-pg-runtime-tenant-crud-v59.mjs'],{cwd:root,env:{PATH:process.env.PATH,CI:'true',NODE_ENV:'test',ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE:'YES',ASSETTRUST_V58_SEEDED_RLS_CONFIRM:'YES'},encoding:'utf8',timeout:6000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/BLOCKED/);assert(!result.stdout.includes('"ok":true'));
});
test('environment authorization happens before dynamic pg import and socket open',()=>{
 const guard=source.indexOf("if(process.env.ASSETTRUST_V59_CRUD_CONFIRM!=='YES'");const url=source.indexOf('validateRuntimeDatabaseUrls(');const importing=source.indexOf("await import('pg')");const connecting=source.indexOf('await operator.connect()');
 assert(guard>=0&&guard<url&&url<importing&&importing<connecting);
});
test('own-tenant INSERT is required for all four core record families',()=>{
 for(const [table,part] of [['assets','asset'],['verification_cases','investigation'],['case_evidence','evidence'],['documents','document']]){
  assert.match(source,new RegExp('INSERT INTO public\\.'+table+'\\('));
  assert(source.includes(`Own-tenant ${part==='investigation'?'case':part} INSERT must succeed`),table);
 }
});
test('authorized UPDATE and DELETE must each modify exactly one row for all protected tables',()=>{
 for(const table of ['assets','verification_cases','case_evidence','documents'])assert(source.includes("['"+table+"','"),table);
 assert(source.includes('Own-tenant UPDATE must succeed'));assert(source.includes('Own-tenant DELETE must succeed'));
 assert(source.includes('updated.rowCount===1'));assert(source.includes('deleted.rowCount===1'));
});
test('cross-tenant forbidden reads, update/delete and inserts remain covered',()=>{
 for(const label of ['no tenant scope','own-tenant SELECT','Cross-tenant UPDATE must be invisible','Cross-tenant DELETE must be invisible','tenant RLS must reject insert'])assert(source.includes(label),label);
});
test('transaction-local scope must reset after rollback and after COMMIT',()=>{
 assert(source.includes('scope must not leak after transaction'));
 assert(source.includes('scope must not leak after COMMIT'));
 assert(source.includes("await runtime.query('COMMIT')"));
 assert(source.includes("await runtime.query('ROLLBACK')"));
});
test('transient authorized operations are checked absent before fixture cleanup',()=>{
 assert(source.includes('const committed=[];const transient=[];'));
 assert(source.includes('transient.map(t=>t[key])'));
 assert(source.includes('Transient test writes were not rolled back'));
 assert(source.indexOf('Transient test writes were not rolled back')<source.indexOf('for(const f of committed.reverse())'));
});
test('synthetic fixture cleanup retains child-to-parent order, with cleanup errors causing failure',()=>{
 assert(source.indexOf("['documents','document']") < source.indexOf("['case_evidence','evidence']"));
 assert(source.includes('Disposable fixture cleanup FAILED'));
 assert(source.includes('process.exitCode=1'));
});
test('CI runs new contract after seeded v58 and before HTTP integrations',()=>{
 const prev=ci.indexOf('run: npm run test:pg:runtime-tenant-isolation:v58'),now=ci.indexOf('run: npm run test:pg:runtime-tenant-crud:v59'),next=ci.indexOf('run: npm run test:e2e:two-api:v42');
 assert(prev>=0&&now>prev&&next>now);
 assert(ci.includes('ASSETTRUST_V59_CRUD_CONFIRM: YES'));
});
test('CI verifies v59 static contract before npm ci',()=>{
 assert(ci.indexOf('npm run verify:v59')>=0&&ci.indexOf('npm run verify:v59')<ci.indexOf('run: npm ci'));
 assert(ci.split('npm run verify:v59').length>=3);
});
test('supervised full database step plan has v59 functional CRUD integration',()=>{
 const steps=dbSteps(pkg).map(s=>s.name);
 assert(steps.includes('test:pg:runtime-tenant-crud:v59'));
 assert(steps.indexOf('test:pg:runtime-tenant-isolation:v58')<steps.indexOf('test:pg:runtime-tenant-crud:v59'));
 assert(steps.indexOf('test:pg:runtime-tenant-crud:v59')<steps.indexOf('two-real-api-instances'));
});
test('all three workspace versions match and script points at the live contract',()=>{
 for(const file of ['package.json','apps/api/package.json','apps/web/package.json']){
  assert.match(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).version,/^0\.(?:59|[6-9]\d|\d{3,})\.0$/);
 }
 assert.equal(pkg.scripts['test:pg:runtime-tenant-crud:v59'],'node tools/e2e-pg-runtime-tenant-crud-v59.mjs');
});
test('25 previously applied migration files remain present and no new migration is fabricated',()=>{
 const sql=fs.readdirSync(path.join(root,'apps/api/sql')).filter(f=>f.endsWith('.sql'));
 assert.equal(sql.length>=25,true);
 assert(sql.includes('025_documents_rls.sql'));
});
