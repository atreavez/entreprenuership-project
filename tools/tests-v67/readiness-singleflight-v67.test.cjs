'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../..');
function load(p,imports={}){
 const src=fs.readFileSync(path.join(ROOT,p),'utf8');
 const result=ts.transpileModule(src,{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}});
 assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 const mod={exports:{}};
 vm.runInNewContext(result.outputText,{module:mod,exports:mod.exports,require:(x)=>{
  if(!(x in imports))throw Error('Unexpected dependency '+x);return imports[x];
 },Error,Promise},{timeout:3000});return mod.exports;
}
const {ReadinessCoordinator}=load('apps/api/src/contexts/platform/domain/readiness-coordinator.ts');
const manifest=load('apps/api/src/contexts/platform/domain/schema-manifest.ts');
const domain=load('apps/api/src/contexts/platform/domain/schema-readiness.ts',{'./schema-manifest':manifest});
const {SchemaProbe}=load('apps/api/src/contexts/platform/infrastructure/schema-probe.ts',{
 '@nestjs/common':{Injectable:()=>cls=>cls,ServiceUnavailableException:class extends Error{}},
 '../../../database':{},'../domain/schema-readiness':domain,'../domain/readiness-coordinator':{ReadinessCoordinator}
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function stubDb(state={}){
 const counters={queries:0,policyChecks:0};
 const db={
  query:async sql=>{counters.queries++;
   if(state.blockAt==='postgis'&&sql.includes('pg_extension'))await state.barrier.promise;
   if(state.fail)throw Error('sensitive-password-from-sql-driver');
   if(sql.includes('pg_extension'))return {rowCount:1};
   if(sql.includes('pg_tables'))return {rows:manifest.REQUIRED_POSTGIS_TABLES.map(tablename=>({tablename}))};
   if(sql.includes('assettrust_schema_migrations'))return {rows:manifest.REQUIRED_SCHEMA_MIGRATIONS};
   throw Error('unexpected SQL');
  },
  assertRuntimeIsolation:async()=>{counters.policyChecks++;if(state.policyInvalid)throw Error('policy invalid');return {policiesVerified:16,tablesVerified:13};}
 };
 return {db,counters};
}
test('single-flight executes one probe for parallel requests and returns one promise',async()=>{
 const gate=new ReadinessCoordinator();const d=deferred();let calls=0;
 const one=gate.execute(()=>{calls++;return d.promise;});const two=gate.execute(()=>{calls++;return Promise.resolve('wrong');});
 assert.equal(one,two);await Promise.resolve();assert.equal(calls,1);d.resolve('verified');
 assert.equal(await one,'verified');assert.equal(await two,'verified');
});
test('successful result is never cached for the NEXT readiness probe',async()=>{
 const gate=new ReadinessCoordinator();let calls=0;
 assert.equal(await gate.execute(async()=>++calls),1);
 assert.equal(await gate.execute(async()=>++calls),2);
 assert.equal(calls,2);
});
test('failed result never leaves coordinator stuck or falsely ready',async()=>{
 const gate=new ReadinessCoordinator();let count=0;
 const d=deferred();const first=gate.execute(()=>{count++;return d.promise;});
 const second=gate.execute(()=>{count++;throw Error('never scheduled');});
 d.reject(Error('policy drift'));
 await assert.rejects(first,/policy drift/);await assert.rejects(second,/policy drift/);
 assert.equal(count,1);assert.equal(await gate.execute(async()=>{count++;return 'reverified';}),'reverified');assert.equal(count,2);
});
test('synchronous throw is converted into a rejection and reset',async()=>{
 const gate=new ReadinessCoordinator();await assert.rejects(gate.execute(()=>{throw Error('thrown');}),/thrown/);
 assert.equal(await gate.execute(async()=>5),5);
});
test('SchemaProbe shares exactly one real catalog inspection across concurrent checks',async()=>{
 const barrier=deferred();const state={blockAt:'postgis',barrier};const {db,counters}=stubDb(state);const probe=new SchemaProbe(db);
 const first=probe.check(),second=probe.check(),third=probe.check();assert.equal(first,second);assert.equal(second,third);
 await Promise.resolve();assert.equal(counters.queries,1);
 barrier.resolve();const results=await Promise.all([first,second,third]);
 assert(results.every(x=>x.ready===true&&x.verifiedMigrations===27&&x.policiesVerified===16));
 assert.equal(counters.queries,3);assert.equal(counters.policyChecks,1);
});
test('a later RLS drift fails the next check rather than reusing last success',async()=>{
 const state={}, {db,counters}=stubDb(state),probe=new SchemaProbe(db);
 assert.equal((await probe.check()).ready,true);
 state.policyInvalid=true;const next=await probe.check();
 assert.equal(next.ready,false);assert.equal(next.verifiedMigrations,undefined);
 assert.equal(counters.policyChecks,2);
});
test('a recovered policy failure does not poison subsequent readiness',async()=>{
 const state={policyInvalid:true};const probe=new SchemaProbe(stubDb(state).db);
 assert.equal((await probe.check()).ready,false);state.policyInvalid=false;
 assert.equal((await probe.check()).ready,true);
});
test('SQL errors fail closed without leaking driver data',async()=>{
 const state={fail:true},probe=new SchemaProbe(stubDb(state).db);
 const result=await probe.check();assert.equal(result.ready,false);
 assert.doesNotMatch(JSON.stringify(result),/sensitive-password/);
});
test('readiness source never includes time-based cached success or forced acceptance',()=>{
 const source=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/platform/domain/readiness-coordinator.ts'),'utf8');
 assert.doesNotMatch(source,/setTimeout|Date\.now|productionApproved|cacheTime|\bttl\b/i);
 assert.match(source,/this\.pending=undefined/);
});
