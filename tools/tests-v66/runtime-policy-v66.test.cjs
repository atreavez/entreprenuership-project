'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function transpile(src,imports={},extra={}){
 const compiled=ts.transpileModule(read(src),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false},reportDiagnostics:true});
 assert.equal(compiled.diagnostics.length,0);
 const module={exports:{}};
 vm.runInNewContext(compiled.outputText,{module,exports:module.exports,require:name=>{
  if(!(name in imports))throw Error('Unexpected import '+name);
  return imports[name];
 },process:{env:{DATABASE_URL:'not-a-real-db',NODE_ENV:'test'}},Promise,Error,...extra},{timeout:3000});
 return module.exports;
}
const policy=transpile('apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts');
const manifest=transpile('apps/api/src/contexts/platform/domain/schema-manifest.ts');
const schema=transpile('apps/api/src/contexts/platform/domain/schema-readiness.ts',{'./schema-manifest':manifest});
const coordinator=transpile('apps/api/src/contexts/platform/domain/readiness-coordinator.ts');
const SchemaProbe=transpile('apps/api/src/contexts/platform/infrastructure/schema-probe.ts',{
 '@nestjs/common':{Injectable:()=>c=>c,ServiceUnavailableException:class extends Error{}},
 '../../../database':{},'../domain/schema-readiness':schema,'../domain/readiness-coordinator':coordinator
}).SchemaProbe;
const tenant="organization_id = (NULLIF(current_setting('assettrust.tenant_id'::text, true), ''::text))::uuid";
const recipient=`(${tenant}) AND (recipient_id = (NULLIF(current_setting('assettrust.actor_id'::text, true), ''::text))::uuid)`;
function catalog(){return policy.POLICY_CONTRACT.map(p=>({tablename:p.table,policyname:p.name,cmd:p.cmd,permissive:'PERMISSIVE',roles:['public'],qual:p.read?(p.read==='tenant'?tenant:recipient):null,with_check:p.write?(p.write==='tenant'?tenant:recipient):null}));}
function fixture(){return {policies:catalog(),rlsEnabled:true,forceEnabled:true,owner:'schema_owner',role:'runtime_app',superuser:false,bypass:false,postgis:true,migrations:manifest.REQUIRED_SCHEMA_MIGRATIONS,tables:manifest.REQUIRED_POSTGIS_TABLES};}
function createDb(state){
 const calls=[];const decorate=()=>()=>{};
 class Pool {
  async query(sql){calls.push(sql);
   if(sql.includes('FROM pg_roles'))return {rows:[{rolsuper:state.superuser,rolbypassrls:state.bypass,rolcreaterole:false,rolcreatedb:false}]};
   if(sql.includes('FROM pg_class'))return {rows:policy.PROTECTED_TABLES.map(relname=>({relname,relrowsecurity:state.rlsEnabled,relforcerowsecurity:state.forceEnabled,table_owner:state.owner}))};
   if(sql.includes('current_user AS runtime_role'))return {rows:[{runtime_role:state.role}]};
   if(sql.includes('FROM pg_policies'))return {rows:state.policies};
   if(sql.includes('pg_extension'))return {rowCount:state.postgis?1:0};
   if(sql.includes('pg_tables'))return {rows:state.tables.map(tablename=>({tablename}))};
   if(sql.includes('assettrust_schema_migrations'))return {rows:state.migrations};
   throw Error('Unexpected fixture query');
  }
 }
 const Database=transpile('apps/api/src/database.ts',{
  '@nestjs/common':{Global:decorate,Injectable:decorate,Module:decorate},
  pg:{Pool},
  './contexts/platform/domain/db-runtime-limits':{ONLINE_DATABASE_LIMITS:{max:12,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:3000,idle_in_transaction_session_timeout:30000}},
  './contexts/tenant-isolation/domain/rls-policy-contract':policy,
  './contexts/tenant-isolation/application/tenant-scope':{}
 }).Database;
 return {db:new Database(),calls};
}
test('actual Database validates 16 policies, 13 tables, runtime role on EVERY inspect',async()=>{
 const f=fixture(),{db,calls}=createDb(f);
 const result=await db.assertRuntimeIsolation();
 assert.equal(result.policiesVerified,16);assert.equal(result.tablesVerified,13);
 assert.equal(calls.length,4);
 const second=await db.assertRuntimeIsolation();assert.equal(second.policiesVerified,16);assert.equal(calls.length,8);
});
test('in insecure dev mode onModuleInit can skip but readiness NEVER skips policy inspection',async()=>{
 const f=fixture(),{db,calls}=createDb(f);
 await db.onModuleInit();assert.equal(calls.length,0);
 const result=await new SchemaProbe(db).check();assert.equal(result.ready,true);assert.equal(calls.length,7);
 assert.equal(result.verifiedMigrations,27);assert.equal(result.policiesVerified,16);assert.equal(result.tablesVerified,13);
});
test('policy added AFTER first readiness causes next readiness to fail closed',async()=>{
 const f=fixture();const {db}=createDb(f),probe=new SchemaProbe(db);
 assert.equal((await probe.check()).ready,true);
 f.policies=[...f.policies,{...f.policies[0],policyname:'unsafe_allow_all'}];
 const next=await probe.check();assert.equal(next.ready,false);assert.equal(next.verifiedMigrations,undefined);assert.equal(next.policiesVerified,undefined);
});
test('recipient rule altered after first readiness is detected',async()=>{
 const f=fixture(),probe=new SchemaProbe(createDb(f).db);
 assert.equal((await probe.check()).ready,true);
 f.policies=f.policies.map((p,i)=>i===13?{...p,qual:tenant}:p);
 assert.equal((await probe.check()).ready,false);
});
test('runtime FORCE RLS altered after successful readiness is detected',async()=>{
 const f=fixture(),probe=new SchemaProbe(createDb(f).db);
 assert.equal((await probe.check()).ready,true);
 f.forceEnabled=false;assert.equal((await probe.check()).ready,false);
});
test('elevated runtime database privilege introduced after startup blocks readiness',async()=>{
 const f=fixture(),probe=new SchemaProbe(createDb(f).db);
 assert.equal((await probe.check()).ready,true);
 f.bypass=true;assert.equal((await probe.check()).ready,false);
});
test('runtime role owning protected table blocks readiness',async()=>{
 const f=fixture(),probe=new SchemaProbe(createDb(f).db);
 f.owner=f.role;assert.equal((await probe.check()).ready,false);
});
test('PostGIS/migration failure prevents policy approval',async()=>{
 const f=fixture(),{db,calls}=createDb(f),probe=new SchemaProbe(db);
 f.postgis=false;assert.equal((await probe.check()).ready,false);assert.equal(calls.filter(x=>x.includes('pg_policies')).length,0);
 f.postgis=true;f.migrations=manifest.REQUIRED_SCHEMA_MIGRATIONS.slice(1);
 assert.equal((await probe.check()).ready,false);assert.equal(calls.filter(x=>x.includes('pg_policies')).length,0);
});
test('raw PostgreSQL error strings never reach readiness result',async()=>{
 const f=fixture(),probe=new SchemaProbe(createDb(f).db);
 f.policies=null;
 const out=await probe.check();assert.equal(out.ready,false);assert.doesNotMatch(JSON.stringify(out),/DATABASE_URL|postgres:\/\//i);
});
test('HTTP readiness publishes runtime policy counters only on verified result',()=>{
 const src=read('apps/api/src/main.ts');
 assert(src.includes("security:'rls-policy-contract-verified'"));
 assert(src.includes('rlsPoliciesVerified:state.policiesVerified'));
 assert(src.includes('protectedTablesVerified:state.tablesVerified'));
 assert(src.indexOf('if(!state.ready)throw new ServiceUnavailableException')<src.indexOf("security:'rls-policy-contract-verified'"));
});
test('admin UI shows policy verification and rejects older ambiguous ready payloads',()=>{
 const src=read('apps/web/src/DeploymentReadinessPage.tsx');
 assert(read('apps/web/src/readiness-contract.ts').includes("x.security!=='rls-policy-contract-verified'"));
 assert(src.includes('status.rlsPoliciesVerified'));
 assert(src.includes('status.protectedTablesVerified'));
});
