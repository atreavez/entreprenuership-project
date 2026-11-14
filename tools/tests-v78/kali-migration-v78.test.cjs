'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const {plan,check,execute}=require('../kali-pg-migrations-v78.cjs');
const ROOT=resolve(__dirname,'../..');
const authorized={ASSETTRUST_V70_LOCAL_CONFIRM:'YES',ASSETTRUST_V78_PG_CONFIRM:'YES',NODE_ENV:'test',PATH:'/usr/bin',HOME:'/tmp'};
const local={NODE_ENV:'test',CI:'true',ASSETTRUST_E2E_ALLOW_MUTATION:'YES'};
test('planning is read-only, actionable and not release approval',()=>{const p=plan();assert.equal(p.status,'NOT_EXECUTED');assert.equal(p.productionApproved,false);assert(p.steps.length>=3);});
test('Kali wrapper rejects missing confirmation',()=>{assert.throws(()=>check({}),/DISPOSABLE_CONFIRMATION/);});
test('Kali wrapper rejects production even with confirmations',()=>{assert.throws(()=>check({...authorized,NODE_ENV:'production'}),/DISPOSABLE_CONFIRMATION/);});
test('Kali wrapper rejects private config not test-locked',()=>{assert.throws(()=>execute({env:authorized,load:()=>({env:{...local,CI:'false'}})}),/DISPOSABLE_CONFIGURATION/);});
test('Kali wrapper refuses partial/unstructured success payload',()=>{
 for(const result of [{status:0,stdout:'ok'}, {status:1,stdout:JSON.stringify({schema:'ASSETTRUST_V78_REAL_PG_RESULT',status:'PASSED',checks:6})},
  {status:0,stdout:JSON.stringify({schema:'ASSETTRUST_V78_REAL_PG_RESULT',status:'PASSED',checks:5})}]){
  const outcome=execute({env:authorized,load:()=>({env:local}),runner:()=>result});
  assert.equal(outcome.status,'FAILED');assert.equal(outcome.productionApproved,false);
 }
});
test('Kali wrapper accepts only six valid read-only PG checks, still release blocked',()=>{
 const outcome=execute({env:authorized,load:()=>({env:local}),runner:(_cmd,_args,opts)=>{
  assert.equal(opts.shell,false);assert.equal(opts.timeout,90000);assert(!('DATABASE_URL' in opts.env));
  return {status:0,stdout:JSON.stringify({schema:'ASSETTRUST_V78_REAL_PG_RESULT',status:'PASSED',checks:6})};
 }});
 assert.equal(outcome.status,'PG_CHECK_PASSED_RELEASE_BLOCKED');assert.equal(outcome.productionApproved,false);
});
test('Kali wrapper CLI rejects live run with no local setup',()=>{
 const run=spawnSync(process.execPath,['tools/kali-pg-migrations-v78.cjs','--run'],{cwd:ROOT,env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(run.status,1);assert.match(run.stderr,/BLOCKED/);
});
test('Kali wrapper plans without invoking a database',()=>{
 const run=spawnSync(process.execPath,['tools/kali-pg-migrations-v78.cjs','--plan'],{cwd:ROOT,env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(run.status,0);assert.equal(JSON.parse(run.stdout).status,'NOT_EXECUTED');
});
