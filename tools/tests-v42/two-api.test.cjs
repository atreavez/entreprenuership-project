'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const policy=require('../two-api-policy-v42.cjs');
const workflow=readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
const manifest=JSON.parse(readFileSync(path.join(ROOT,'package.json'),'utf8'));
const base={CI:'true',NODE_ENV:'test',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',ASSETTRUST_V42_TWO_API_CONTRACT:'YES',ASSETTRUST_E2E_TARGET_ID:'fixture-marker-123456789',ASSETTRUST_E2E_EXPECT_TARGET:'fixture-marker-123456789',DATABASE_URL:'postgres://test:example@127.0.0.1:5432/assettrust_ci',ASSETTRUST_E2E_URL:'http://127.0.0.1:4000'};

test('v0.42 script, complete CI coverage, and two-server gate are declared',()=>{
 assert.equal(manifest.scripts['verify:v42'],'node --test tools/tests-v42/*.test.cjs');
 assert.equal(manifest.scripts['test:e2e:two-api:v42'],'node tools/e2e-two-api-v42.mjs');
 const {validateCi}=require('../ci-completeness-v41.cjs');
 const ci=validateCi({root:ROOT});assert(ci.ok,ci.issues.join('; '));
 assert(ci.versionSuiteCount>=40);
 assert(workflow.includes('npm run test:e2e:two-api:v42'));
 assert(workflow.includes('ASSETTRUST_V42_TWO_API_CONTRACT: YES'));
});
test('CI contract rejects missing two-server execution or explicit authorization',()=>{
 const {validateCi}=require('../ci-completeness-v41.cjs');
 for(const bad of [workflow.replace('npm run test:e2e:two-api:v42','echo omitted-two-api'),workflow.replace('ASSETTRUST_V42_TWO_API_CONTRACT: YES','ASSETTRUST_V42_TWO_API_CONTRACT: NO')]){
  const r=validateCi({workflow:bad,manifest});assert(!r.ok,r.issues.join('; '));
 }
});
test('policy rejects unapproved environments and nonlocal/production targets',()=>{
 assert.deepEqual(policy.assertTwoApiEnvironment(base).ports,[4101,4102]);
 for(const edit of [
  {CI:'false'},{NODE_ENV:'production'},{ASSETTRUST_E2E_ALLOW_MUTATION:'NO'},
  {ASSETTRUST_V42_TWO_API_CONTRACT:'NO'},
  {DATABASE_URL:'postgres://test:pass@remote.example.com:5432/assettrust_ci'},
  {DATABASE_URL:'postgres://test:pass@127.0.0.1:5432/assettrust'},
  {ASSETTRUST_E2E_TARGET_ID:'different'},
  {ASSETTRUST_E2E_URL:'http://attacker.example.com:4000'}
 ])assert.throws(()=>policy.assertTwoApiEnvironment({...base,...edit}));
});
test('two API ports require nonprivileged, distinct, strict numeric values',()=>{
 for(const edit of [
  {ASSETTRUST_V42_API_PORT_A:'4101',ASSETTRUST_V42_API_PORT_B:'4101'},
  {ASSETTRUST_V42_API_PORT_A:'443'},
  {ASSETTRUST_V42_API_PORT_B:'70000'},
  {ASSETTRUST_V42_API_PORT_A:'4101.0'},
  {ASSETTRUST_V42_API_PORT_A:'4101;echo bad'},
  {ASSETTRUST_V42_API_PORT_A:'04001'}
 ])assert.throws(()=>policy.assertTwoApiEnvironment({...base,...edit}));
 assert.deepEqual(policy.assertTwoApiEnvironment({...base,ASSETTRUST_V42_API_PORT_A:'5011',ASSETTRUST_V42_API_PORT_B:'5012'}).ports,[5011,5012]);
});
test('negative credential probe never sends secrets in querystring or accepts success',()=>{
 const p=policy.recipientProbe('http://127.0.0.1:4101','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.equal(p.url,'http://127.0.0.1:4101/api/v1/reports/recipient/redeem');
 assert.equal(p.options.method,'POST');assert.equal(p.options.headers['Cache-Control'],'no-store');
 assert(!p.url.includes('accessToken'));
 assert.equal(JSON.parse(p.options.body).shareId,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert.throws(()=>policy.assertDeniedResponse({status:200,headers:{get:()=>null}}));
 assert.throws(()=>policy.assertDeniedResponse({status:500,headers:{get:()=>null}}));
 policy.assertDeniedResponse({status:404,headers:{get:()=> 'no-store'}});
});
test('supervisor source contains two independent owned-health checks and guaranteed process cleanup',()=>{
 const src=readFileSync(path.join(ROOT,'tools/e2e-two-api-v42.mjs'),'utf8');
 for(const needle of ['assertTwoApiEnvironment(process.env)','waitForOwnedApiReady','Promise.all','finally','stopChild','recipientProbe','assertDeniedResponse'])assert(src.includes(needle),needle);
 assert(src.indexOf('assertTwoApiEnvironment(process.env)')<src.indexOf('spawn('));
});
test('disposable verification runner guards target before any npm install, migration or HTTP run',()=>{
 const sh=readFileSync(path.join(ROOT,'tools/run-v42-disposable-validation.sh'),'utf8');
 assert(sh.includes('set -euo pipefail'));
 assert(sh.indexOf('assertTwoApiEnvironment(process.env)')<sh.indexOf('npm ci'));
 assert(sh.indexOf('assertTwoApiEnvironment(process.env)')<sh.indexOf('db:migrate'));
 assert(sh.includes('package-lock.json'));
 assert(sh.includes('npm run test:e2e:two-api:v42'));
});
test('unsafe execution fails before Node imports a DB driver or starts a server',()=>{
 const r=spawnSync(process.execPath,['tools/e2e-two-api-v42.mjs'],{cwd:ROOT,encoding:'utf8',env:{...process.env,NODE_ENV:'production',DATABASE_URL:'postgres://test:pass@127.0.0.1:5432/assettrust_ci',ASSETTRUST_V42_TWO_API_CONTRACT:'NO'}});
 assert.notEqual(r.status,0);assert.match(r.stderr+r.stdout,/authorization|requires|test|environment|contract/i);
});
