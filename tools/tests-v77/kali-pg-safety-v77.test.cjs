'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const subject=require('../kali-pg-disputes-v77.cjs');
const fakeConfig={env:{NODE_ENV:'test',CI:'true',ASSETTRUST_E2E_ALLOW_MUTATION:'YES',
 DATABASE_URL:'postgres://operator:secret@127.0.0.1:55432/assettrust_test',
 ASSETTRUST_RUNTIME_DATABASE_URL:'postgres://runtime:secret@127.0.0.1:55432/assettrust_test'}};
const confirm={ASSETTRUST_V77_PG_CONFIRM:'YES',ASSETTRUST_V70_LOCAL_CONFIRM:'YES'};
test('plan is read-only and does not claim database acceptance',()=>{
 const p=subject.plan();assert.equal(p.status,'NOT_EXECUTED');assert.equal(p.productionApproved,false);
 assert.match(p.target,/non-bypass/);
});
for(const missing of ['ASSETTRUST_V77_PG_CONFIRM','ASSETTRUST_V70_LOCAL_CONFIRM'])test(`missing ${missing} blocks before any private load`,()=>{
 let loads=0;const env={...confirm};delete env[missing];
 assert.throws(()=>subject.execute({env,load:()=>{loads++;return fakeConfig},runner:()=>{throw Error('Unexpected child')}}));
 assert.equal(loads,0);
});
test('production setting blocks private database load',()=>{
 let loads=0;assert.throws(()=>subject.execute({env:{...confirm,NODE_ENV:'production'},load:()=>{loads++;return fakeConfig}}));
 assert.equal(loads,0);
});
for(const [key,value] of [['NODE_ENV','production'],['CI','false'],['ASSETTRUST_E2E_ALLOW_MUTATION','NO']])test(`untrusted loaded ${key} refuses invocation`,()=>{
 const copy={env:{...fakeConfig.env,[key]:value}};let calls=0;
 assert.throws(()=>subject.execute({env:confirm,load:()=>copy,runner:()=>{calls++;return {status:0}}}));assert.equal(calls,0);
});
test('supervisor passes only private config to a non-shell child and checks provenance',()=>{
 let calls=0;let opts=null;
 const x=subject.execute({root,env:{...confirm,PATH:'/bin',LEAK_SECRET:'should-not-pass'},load:()=>fakeConfig,
  runner:(bin,args,options)=>{calls++;opts=options;assert.equal(bin,process.execPath);
   assert.deepEqual(args,['tools/e2e-pg-cross-case-disputes-v77.mjs','--run']);
   return {status:0,stdout:JSON.stringify({schema:'ASSETTRUST_V77_REAL_PG_RESULT',status:'PASSED',checks:11})};}});
 assert.equal(calls,1);assert.equal(opts.shell,false);assert.equal(opts.env.LEAK_SECRET,undefined);
 assert.equal(opts.env.DATABASE_URL,fakeConfig.env.DATABASE_URL);
 assert.equal(x.status,'POSTGRES_ACCEPTANCE_PASSED_RELEASE_BLOCKED');assert.equal(x.productionApproved,false);
});
test('incorrect source schema cannot be accepted even with exit 0',()=>{
 const x=subject.execute({env:confirm,load:()=>fakeConfig,runner:()=>({status:0,stdout:'{"schema":"WRONG","status":"PASSED"}'})});
 assert.equal(x.status,'FAILED');
});
test('signal, timeout, and missing report all fail closed',()=>{
 for(const child of [{status:null,signal:'SIGTERM',stdout:''},{status:null,error:{code:'ETIMEDOUT'}},{status:0,stdout:''}]){
  const x=subject.execute({env:confirm,load:()=>fakeConfig,runner:()=>child});assert.equal(x.status,'FAILED');
 }
});
test('plan command works without PostgreSQL or secrets',()=>{
 const result=spawnSync(process.execPath,['tools/e2e-pg-cross-case-disputes-v77.mjs','--plan'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0);assert.match(result.stdout,/NOT_EXECUTED/);
});
test('direct run cannot connect without explicit disposable authorization',()=>{
 const result=spawnSync(process.execPath,['tools/e2e-pg-cross-case-disputes-v77.mjs','--run'],{
  cwd:root,env:{PATH:process.env.PATH,CI:'true',NODE_ENV:'test',DATABASE_URL:'postgres://fake@127.0.0.1/assettrust_test'},encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/BLOCKED/);
});
