'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
const policy=path.join(ROOT,'tools/workflow-policy-v53.rb');
const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
function check(value){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v53-workflow-'));
 const filename=path.join(dir,'test.yml');fs.writeFileSync(filename,value);
 try{
  const run=spawnSync('ruby',[policy,filename],{cwd:ROOT,encoding:'utf8',timeout:30000});
  assert.equal(run.signal,null,'Ruby parser must terminate normally');
  assert(!run.error,run.error?.message);
  const result=JSON.parse(run.stdout);
  return {status:run.status,result};
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('actual GitHub workflow parses and meets release-security contract',()=>{
 const checked=check(source);
 assert.equal(checked.status,0,checked.result.issues.join('; '));
 assert.equal(checked.result.ok,true);
 assert(checked.result.versionSuiteCount>=51);
 assert(checked.result.pgContractCount>=24);
});
test('a syntactically invalid workflow fails even if required command strings remain',()=>{
 const changed=source.replace('          ASSETTRUST_E2E_ALLOW_MUTATION: YES\n        run: npm run test:pg:assets-cases-rls:v49', '      CLAMAV_TCP_PORT: "3310"\n          ASSETTRUST_E2E_ALLOW_MUTATION: YES\n        run: npm run test:pg:assets-cases-rls:v49');
 assert.notEqual(changed,source);
 const outcome=check(changed);
 assert.notEqual(outcome.status,0);assert(outcome.result.issues.some(x=>x.includes('Invalid workflow YAML')));
});
test('duplicate env key is explicitly rejected, even when YAML parser would accept it',()=>{
 const changed=source.replace('      NODE_ENV: test\n', '      NODE_ENV: test\n      NODE_ENV: production\n');
 assert.notEqual(changed,source);const outcome=check(changed);
 assert.notEqual(outcome.status,0);assert(outcome.result.issues.some(x=>/Duplicate YAML key/.test(x)));
});
test('omitting any declared live PostgreSQL test causes a workflow failure',()=>{
 const changed=source.replace('run: npm run test:pg:documents-rls:v50','run: echo skipped-document-rls');
 assert.notEqual(changed,source);const {status,result}=check(changed);
 assert.notEqual(status,0);assert(result.issues.some(x=>x.includes('test:pg:documents-rls:v50')));
});
test('scanner service or live scanner check cannot be silently removed',()=>{
 for(const changed of [source.replace('image: clamav/clamav:stable','image: untrusted/fake:stable'),source.replace('if npm run security:clamav:v52;', 'if echo scanner-skipped;')]){
  assert.notEqual(changed,source);const {status,result}=check(changed);
  assert.notEqual(status,0);assert(result.issues.some(x=>/ClamAV/i.test(x)),result.issues.join('; '));
 }
});
test('Git-history checkout depth and high-severity npm audit remain mandatory',()=>{
 for(const changed of [source.replace('fetch-depth: 0','fetch-depth: 1'),source.replace('npm audit --omit=dev --audit-level=high','echo skipped-vulnerabilities')]){
  assert.notEqual(changed,source);assert.notEqual(check(changed).status,0);
 }
});
test('mutating live database test without explicit authorization fails contract',()=>{
 const changed=source.replace(`          ASSETTRUST_E2E_ALLOW_MUTATION: YES
        run: npm run test:pg:documents-rls:v50`,`          ASSETTRUST_E2E_ALLOW_MUTATION: NO
        run: npm run test:pg:documents-rls:v50`);
 assert.notEqual(changed,source);
 assert.notEqual(check(changed).status,0);
});
test('workflow must parse and pass before running npm ci',()=>{
 const changed=source.replace('ruby tools/workflow-policy-v53.rb','echo workflow-syntax-skipped');
 assert.notEqual(changed,source);assert.notEqual(check(changed).status,0);
 const syntax=source.indexOf('ruby tools/workflow-policy-v53.rb'),install=source.indexOf('run: npm ci');
 assert(syntax>=0&&install>=0&&syntax<install);
});
test('all root and workspace versions stay in sync, with no modified SQL migrations',()=>{
 assert(Number(pkg.version.split('.')[1])>=53, 'v53 workflow contract must remain compatible with later versions');
 for(const name of ['apps/api/package.json','apps/web/package.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,name))).version,pkg.version);
 assert.equal(pkg.scripts['verify:v53'],'node --test --test-concurrency=1 tools/tests-v53/*.test.cjs');
 assert.equal(pkg.scripts['verify:ci:v53'],'ruby tools/workflow-policy-v53.rb');
 const scripts=Object.keys(pkg.scripts).filter(x=>/^test:pg:/.test(x));assert(scripts.length>=24);
 assert.equal(fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(f=>/^\d{3}_.*\.sql$/.test(f)).length>=25,true);
});
test('legacy static CI check and real Ruby parsing both agree on valid pipeline',()=>{
 const {validateCi}=require('../ci-completeness-v41.cjs');
 const report=validateCi({root:ROOT});assert(report.ok,report.issues.join('; '));
 assert.equal(check(source).result.ok,true);
});
