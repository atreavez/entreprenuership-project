'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const ROOT=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
function load(rel,imports={}){
 const file=path.join(ROOT,'apps/api/src',rel),m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(code,{module:m,exports:m.exports,require:id=>imports[id],process,Date,Error},{filename:file,timeout:5000});return m.exports;
}
const U='e4e892b1-678b-43cd-80a4-33165d041f7a';
test('migration 024 adds FORCE RLS policies for assets and cases, with default deny',()=>{
 const sql=read('apps/api/sql/024_assets_and_cases_rls.sql');
 for(const table of ['assets','verification_cases']){
  assert(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
  assert(sql.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`));
  assert(sql.includes(`CREATE POLICY ${table}_tenant_v49 ON public.${table}`));
 }
 assert.equal((sql.match(/assettrust\.tenant_id/g)||[]).length,4);
 assert.equal((sql.match(/FOR ALL TO PUBLIC/g)||[]).length,2);
 assert.equal((sql.match(/WITH CHECK/g)||[]).length,2);
 assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/\b(DROP|TRUNCATE|DELETE|UPDATE|BYPASSRLS|SECURITY DEFINER)\b|DISABLE ROW LEVEL SECURITY/);
});
test('schema manifest records byte-accurate forward-only migration',()=>{
 const {buildPlan}=require('../migrations/plan.cjs'),p=buildPlan();assert(p.length>=24);
 assert.equal(p[23].filename,'024_assets_and_cases_rls.sql');
 const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'apps/api/sql/024_assets_and_cases_rls.sql'))).digest('hex');
 assert.equal(p[23].sha256,sha);
 for(let i=0;i<23;i++)assert(!p[i].filename.includes('024_'));
});
test('Database.tenantQuery is a transaction-scoped and parameterized operation',async()=>{
 const calls=[];
 class FakePool{
  async connect(){return {query:async(sql,params)=>{calls.push({sql,params});return {rows:[{ok:true}]}},release(){calls.push({sql:'RELEASE'})}}}
  async end(){}
 }
 const domain=load('contexts/tenant-isolation/domain/tenant-policy.ts');
 const scope=load('contexts/tenant-isolation/application/tenant-scope.ts',{'../domain/tenant-policy':domain});
 const dec=()=>()=>{};
 const db=load('database.ts',{'@nestjs/common':{Global:dec,Injectable:dec,Module:dec},pg:{Pool:FakePool},'./contexts/platform/domain/db-runtime-limits':{ONLINE_DATABASE_LIMITS:{max:12,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:3000,idle_in_transaction_session_timeout:30000}},'./contexts/tenant-isolation/application/tenant-scope':scope});
 const old=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://localhost/test';
 try{
  const instance=new db.Database();
  const result=await instance.tenantQuery(U,'SELECT * FROM assets WHERE organization_id=$1',[U]);
  assert.equal(result.rows.length,1);
  assert.equal(calls[0].sql,'BEGIN');
  assert.equal(calls[1].sql,"SELECT set_config('assettrust.tenant_id',$1,true)");
  assert.equal(calls[1].params[0],U);
  assert.equal(calls[2].params[0],U);
  assert.equal(calls[3].sql,'COMMIT');
  assert.equal(calls[4].sql,'RELEASE');
  await assert.rejects(()=>instance.tenantQuery('*','SELECT * FROM assets'),/organization UUID/);
  assert.equal(calls.at(-2).sql,'ROLLBACK');
 }finally{if(old===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=old}
});
test('all first-party direct asset and case reads use tenant scoped database wrapper',()=>{
 for(const rel of ['assets.ts','cases.ts','documents.ts','access.ts','operations.ts','dashboard.ts','contexts/geospatial/infrastructure/pg-parcel.repository.ts']){
  const s=read('apps/api/src/'+rel);
  assert(!/this\.db\.query\(/.test(s),`${rel}: unscoped direct pool query`);
  assert(s.includes('this.db.tenantQuery(')||(rel==='dashboard.ts'&&s.includes('this.db.transaction(async tx=>{')&&s.includes('await setTenantScope(tx,u.organizationId)')&&s.includes('await currentReadAuthority(tx,u)')),`${rel}: no scoped read`);
 }
 const access=read('apps/api/src/access.ts');
 assert(access.includes('this.db.tenantQuery(user.organizationId,'));
 assert(access.includes('this.db.tenantQuery(r.user.organizationId,') || (access.includes('await setTenantScope(tx,u.organizationId)') && access.includes('await requireCurrentOrganizationAdmin(tx,u)')), 'grant administration must use a tenant-scoped read and current database role check');
});
test('transactional asset and case mutations set scope before SQL',()=>{
 for(const rel of ['assets.ts','cases.ts','documents.ts','operations.ts','contexts/geospatial/infrastructure/pg-parcel.repository.ts']){
  const source=read('apps/api/src/'+rel);
  const n=(source.match(/this\.db\.transaction\(async tx=>\{/g)||[]).length;
  const tenant=(source.match(/this\.db\.transaction\(async tx=>\{\s*await setTenantScope\(tx,u\.organizationId\)/g)||[]).length;
  assert(n>0&&n===tenant,`${rel}: ${tenant}/${n} transactions scoped`);
 }
 const s=read('apps/api/src/contexts/member-management/infrastructure/member-management.module.ts');
 assert.match(s,/async decideRole\([^]*?this\.db\.transaction\(async tx=>\{\s*await setTenantScope\(tx,actor\.organizationId\)/);
 const r=read('apps/api/src/contexts/report-sharing/infrastructure/report-sharing.module.ts');
 assert.match(r,/async function checkedReport\([^]*?await setTenantScope\(tx,org\)/);
});
test('public report verification resolves tenant from immutable report reference, never URL tenant input',()=>{
 const s=read('apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts');
 const v=s.slice(s.indexOf('async verifyPublic('),s.indexOf("@Controller('reports/issued')"));
 assert(v.includes('SELECT organization_id FROM issued_verification_reports WHERE id=$1'));
 assert(v.includes('await setTenantScope(tx,lookup.rows[0].organization_id)'));
 assert(!v.includes('actor.organizationId'));
});
test('startup requires six protected relations and rejects privileged role',()=>{
 const s=read('apps/api/src/database.ts');
 for(const table of ['assets','verification_cases','case_evidence','report_pdf_layout_proposals','report_pdf_layout_active','report_pdf_layout_revisions'])
  assert(s.includes(`'public.${table}'::regclass`));
 assert(Number(s.match(/tables\.length!==(\d+)/)?.[1])>=6,'future append-only RLS relations must not weaken the original six');
 assert(s.includes('rolbypassrls'));
 assert(s.includes('table_owner===currentRole'));
});
test('live PostgreSQL contract denies unsafe targets before connecting, tests both tenants and rolls back',()=>{
 const s=read('tools/e2e-pg-assets-cases-rls-v49.mjs');
 assert(s.indexOf('validateDisposablePgTarget(process.env)')<s.indexOf("await import('pg')"));
 for(const x of ['SET LOCAL ROLE','NOBYPASSRLS','ROLLBACK TO SAVEPOINT','relforcerowsecurity','case','assets','ROLLBACK'])
  assert(s.includes(x),x);
});
test('CI covers v49 unit and database checks without bypass flags',()=>{
 const p=JSON.parse(read('package.json')),yaml=read('.github/workflows/ci.yml');
 assert.equal(p.scripts['verify:v49'],'node --test tools/tests-v49/*.test.cjs');
 assert.equal(p.scripts['test:pg:assets-cases-rls:v49'],'node tools/e2e-pg-assets-cases-rls-v49.mjs');
 assert(yaml.includes('npm run verify:v49'));assert(yaml.includes('npm run test:pg:assets-cases-rls:v49'));
 assert.match(yaml,/Verify assets and cases tenant RLS on disposable PostgreSQL[\s\S]*?ASSETTRUST_E2E_ALLOW_MUTATION: YES/);
 assert(require('../ci-completeness-v41.cjs').validateCi().ok);
});
