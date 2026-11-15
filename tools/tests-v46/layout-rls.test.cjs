'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const validA='e4e892b1-678b-43cd-80a4-33165d041f7a';
const validB='bb4ad6fe-a279-41b7-b08d-654b48d4d01c';
function load(rel,imports={}){
 const file=path.join(root,'apps/api/src',rel),mod={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>imports[id],process,Date,Error},{filename:file,timeout:5000});
 return mod.exports;
}
const domain=load('contexts/tenant-isolation/domain/tenant-policy.ts');
const adapter=load('contexts/tenant-isolation/application/tenant-scope.ts',{'../domain/tenant-policy':domain});
test('valid organization IDs normalize consistently, with no wildcard grants',()=>{
 assert.equal(domain.validateTenantId(validA.toUpperCase()),validA);
 assert.equal(domain.validateTenantId(validB),validB);
});
test('tenant context rejects arbitrary strings, SQL, wildcard, empty and malicious content',()=>{
 for(const value of [undefined,null,'','*','all','org-1','not-a-uuid',"'); SET ROLE postgres;--",42,{},validA+';DROP TABLE users'])
  assert.throws(()=>domain.validateTenantId(value),/organization UUID/);
});
test('adapter sets only transaction-local parameterized tenant context and does not interpolate ID',async()=>{
 const calls=[];const tx={query:async(sql,params=[])=>{calls.push({sql,params});return {rows:[]}}};
 await adapter.setTenantScope(tx,validA);
 assert.equal(calls.length,1);
 assert.equal(calls[0].sql,"SELECT set_config('assettrust.tenant_id',$1,true)");
 assert.equal(calls[0].params[0],validA);
 assert(!calls[0].sql.includes(validA));
});
test('invalid context is rejected before querying a pooled database',async()=>{
 const tx={query:async()=>{throw Error('should never query')}};
 await assert.rejects(()=>adapter.setTenantScope(tx,'*'),/organization UUID/);
});
test('additive migration enables FORCE RLS for all 3 private PDF-layout tables with tenant read/write guards',()=>{
 const sql=read('apps/api/sql/021_pdf_layout_rls.sql');
 const tables=['report_pdf_layout_proposals','report_pdf_layout_revisions','report_pdf_layout_active'];
 for(const table of tables){
  assert(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
  assert(sql.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`));
  assert(new RegExp(`CREATE POLICY ${table}_tenant_v46 ON public\\.${table}`).test(sql));
 }
 assert.equal((sql.match(/USING \(organization_id = NULLIF\(current_setting\('assettrust.tenant_id', true\),' '\)::uuid\)/g)||[]).length,0);
 assert.equal((sql.match(/USING \(organization_id = NULLIF\(current_setting\('assettrust.tenant_id', true\),''\)::uuid\)/g)||[]).length,3);
 assert.equal((sql.match(/WITH CHECK \(organization_id = NULLIF\(current_setting\('assettrust.tenant_id', true\),''\)::uuid\)/g)||[]).length,3);
 assert(!/BYPASSRLS|SECURITY DEFINER|SET ROLE|DISABLE ROW LEVEL SECURITY/i.test(sql.replace(/^--.*$/gm,'')));
});
test('only the private report-layout RLS tables are enabled; no public verifier or users RLS activation',()=>{
 const sql=read('apps/api/sql/021_pdf_layout_rls.sql');
 const activated=[...sql.matchAll(/ALTER TABLE public\.(\w+) ENABLE ROW LEVEL SECURITY/g)].map(x=>x[1]).sort();
 assert.deepEqual(activated,['report_pdf_layout_active','report_pdf_layout_proposals','report_pdf_layout_revisions']);
});
test('layout admin scopes all four operation paths after current MFA authorization',()=>{
 const source=read('apps/api/src/contexts/report-layout/infrastructure/report-layout.module.ts');
 assert.equal((source.match(/await assertCurrentAdminStepUp\(tx,actor,sid\);await setTenantScope\(tx,actor.organizationId\);/g)||[]).length,4);
 assert(source.includes('return this.db.transaction(async tx=>'));
});
test('recipient redeem scopes only after resolving the report share organization and validating credentials',()=>{
 const source=read('apps/api/src/contexts/report-sharing/infrastructure/report-sharing.module.ts');
 const i=source.indexOf('await setTenantScope(tx,p.organization_id)');
 assert(i>0);
 assert(i>source.indexOf('matchShareSecrets('));
 assert(i<source.indexOf('FROM report_pdf_layout_active a'));
});
test('production DB startup refuses RLS-bypass roles and unprotected layout tables',()=>{
 const db=read('apps/api/src/database.ts');
 assert(db.includes("process.env.NODE_ENV!=='production'"));
 assert(db.includes('roles[0].rolsuper||roles[0].rolbypassrls||roles[0].rolcreaterole||roles[0].rolcreatedb'));
 assert(db.includes('pg_get_userbyid(relowner) AS table_owner'));
 assert(db.includes('relforcerowsecurity'));
 assert(db.includes("throw new Error('Required private table tenant row-level security"));
});
test('v0.46 migration appended with exact byte digest without rewriting old migrations',()=>{
 const {buildPlan}=require('../migrations/plan.cjs');
 const plan=buildPlan(),manifest=read('apps/api/src/contexts/platform/domain/schema-manifest.ts');
 assert(plan.length>=21);
 assert(plan[20].filename==='021_pdf_layout_rls.sql');
 assert(manifest.includes(`filename: '021_pdf_layout_rls.sql', sha256: '${plan[20].sha256}'`));
});
test('CI includes the RLS tests, disposable DB contract and release gates',()=>{
 const yaml=read('.github/workflows/ci.yml');
 assert(yaml.includes('npm run verify:v46'));
 assert(yaml.includes('npm run test:pg:layout-rls:v46'));
 const pgTest=yaml.slice(yaml.indexOf('Verify PostgreSQL RLS tenant isolation'));
 assert(pgTest.includes('ASSETTRUST_E2E_ALLOW_MUTATION: YES'));
});
test('live RLS contract requires guarded disposable target and executes as a different non-bypass role',()=>{
 const s=read('tools/e2e-pg-layout-rls-v46.mjs');
 assert(s.indexOf('validateDisposablePgTarget(process.env)')<s.indexOf("await import('pg')"));
 assert(s.includes('NOBYPASSRLS'));
 assert(s.includes('SET LOCAL ROLE'));
 assert(s.includes('ROLLBACK'));
 assert(s.includes('GRANT SELECT'));
});
const dbSource=read('apps/api/src/database.ts');
const expectedProtectedTables=[...dbSource.matchAll(/'public\.([a-z_]+)'::regclass/g)].map(m=>m[1]);
assert(expectedProtectedTables.length>=6,'original RLS coverage must not be weakened');
function databaseFixture({roles=[{rolsuper:false,rolbypassrls:false}],tables=expectedProtectedTables.map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,table_owner:'migration_owner'}))}={}){
 const calls=[];
 class Pool{
  constructor(){this.calls=calls;}
  async query(sql){calls.push(sql);if(sql.includes('FROM pg_roles'))return {rows:roles};
   if(sql.includes('SELECT current_user AS runtime_role'))return {rows:[{runtime_role:'runtime_app'}]};
   if(sql.includes('FROM pg_class'))return {rows:tables};
   return {rows:[]};}
  async end(){}
 }
 const decorator=()=>()=>{};
 const db=load('database.ts',{
  '@nestjs/common':{Global:decorator,Injectable:decorator,Module:decorator},
  pg:{Pool},
  './contexts/platform/domain/db-runtime-limits':{ONLINE_DATABASE_LIMITS:{max:12,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:3000,idle_in_transaction_session_timeout:30000}},
  './contexts/tenant-isolation/domain/rls-policy-contract':{PROTECTED_TABLES:expectedProtectedTables,inspectPolicyInventory:()=>({ok:true,issues:[]})}
 });
 const instance=new db.Database();return {instance,calls};
}
test('production database initialization checks role and RLS before accepting requests',async()=>{
 const before=process.env.NODE_ENV;
 const url=process.env.DATABASE_URL;
 process.env.DATABASE_URL='postgres://local:pass@127.0.0.1:5432/assettrust_ci';
 process.env.NODE_ENV='production';
 try{
  const good=databaseFixture();await good.instance.onModuleInit();
  assert.equal(good.calls.length,4);
  await good.instance.onModuleDestroy();
  for(const roles of [[{rolsuper:true,rolbypassrls:false}],[{rolsuper:false,rolbypassrls:true}],[{rolsuper:false,rolbypassrls:false,rolcreaterole:true}],[{rolsuper:false,rolbypassrls:false,rolcreatedb:true}],[]]){
   const bad=databaseFixture({roles});
   await assert.rejects(()=>bad.instance.onModuleInit(),/Unsafe PostgreSQL application role/);
  }
  const owner=databaseFixture({tables:expectedProtectedTables.map((relname,i)=>({relname,relrowsecurity:true,relforcerowsecurity:true,table_owner:i===0?'runtime_app':'migration_owner'}))});
  await assert.rejects(()=>owner.instance.onModuleInit(),/must not own tenant-isolated tables/);
  for(const tables of [[{relname:'one',relrowsecurity:false,relforcerowsecurity:false}],
   [{relname:'a',relrowsecurity:true,relforcerowsecurity:true},
    {relname:'b',relrowsecurity:true,relforcerowsecurity:true},
    {relname:'c',relrowsecurity:true,relforcerowsecurity:false}]]){
   const bad=databaseFixture({tables});
   await assert.rejects(()=>bad.instance.onModuleInit(),/tenant row-level security is missing/);
  }
 }finally{
  if(before===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=before;
  if(url===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=url;
 }
});
