'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('package.json'));
const workflow=read('.github/workflows/ci.yml');
const sql=read('apps/api/sql/026_audit_events_rls.sql').replace(/^--.*$/gm,'');
function loadAudit(spy){
 const ts=require('typescript');
 const source=read('apps/api/src/audit.ts');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 const exports={};
 const deco=()=>()=>{};
 const stubs={
  '@nestjs/common':{Injectable:deco,Controller:deco,Get:deco,Req:deco,UseGuards:deco,Module:deco},
  './database':{},'./common':{uid:crypto.randomUUID,hash:x=>crypto.createHash('sha256').update(x).digest('hex'),assertRole:()=>{}},
  './auth':{AuthGuard:class{},AuthModule:class{}},
  './contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async (tx,org)=>{spy.push(['setTenantScope',org]);await tx.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);}},
  './contexts/access/infrastructure/transactional-access':{requireCurrentOrganizationAdmin:async (tx,user)=>{spy.push(['currentAdminRoleLocked',user.id]);}},
 };
 vm.runInNewContext(compiled,{module:{exports},exports,require:n=>{if(n==='node:crypto')return crypto;if(Object.hasOwn(stubs,n))return stubs[n];throw Error('Undeclared dependency: '+n);},console,Date,JSON,Object,Array,Error,Promise,Buffer}, {timeout:5000,filename:'audit.ts'});
 return exports.AuditService;
}
test('append-only forward migration enables and forces audit_events RLS',()=>{
 assert.match(sql,/^\s*BEGIN;/);assert.match(sql,/COMMIT;\s*$/);
 assert.match(sql,/ALTER TABLE public\.audit_events ENABLE ROW LEVEL SECURITY;/);
 assert.match(sql,/ALTER TABLE public\.audit_events FORCE ROW LEVEL SECURITY;/);
});
test('default-deny SELECT and INSERT policies use transaction-local scope',()=>{
 assert.equal((sql.match(/CREATE POLICY\s+/g)||[]).length,2);
 assert.match(sql,/FOR SELECT TO PUBLIC\s+USING\s*\(organization_id = NULLIF\(current_setting\('assettrust\.tenant_id', true\), ''\)::uuid\)/);
 assert.match(sql,/FOR INSERT TO PUBLIC\s+WITH CHECK\s*\(organization_id = NULLIF\(current_setting\('assettrust\.tenant_id', true\), ''\)::uuid\)/);
});
test('SQL migration never adds update/delete bypass, permissive fallback or destructive statements',()=>{
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE|UPDATE|GRANT|BYPASSRLS|SECURITY DEFINER)\b|FOR ALL|USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
});
test('new migration SHA-256 is recorded without changing historical fingerprints',()=>{
 const plan=require('../migrations/plan.cjs').buildPlan();
 assert(plan.length>=26);
 assert.equal(plan[25].filename,'026_audit_events_rls.sql');
 assert.equal(plan[25].sha256,crypto.createHash('sha256').update(read('apps/api/sql/026_audit_events_rls.sql')).digest('hex'));
 const entries=read('apps/api/src/contexts/platform/domain/schema-manifest.ts');
 for(const entry of plan)assert(entries.includes(`sha256: '${entry.sha256}'`),entry.filename);
});
test('audit.write sets scoped database tenant before locking or querying chain head',async()=>{
 const spy=[];const tx={query:async(sql,params)=>{spy.push(['query',sql,params]);if(sql.includes('SELECT event_hash'))return {rows:[]};return {rows:[]};}};
 const AuditService=loadAudit(spy);const user={id:crypto.randomUUID(),organizationId:crypto.randomUUID()};
 const svc=new AuditService({});
 await svc.write(tx,user,'CHECK','asset',crypto.randomUUID(),{test:true});
 assert.equal(spy[0][0],'setTenantScope');assert.equal(spy[0][1],user.organizationId);
 assert.match(spy[1][1],/SELECT set_config\('assettrust\.tenant_id'/);
 const lockAt=spy.findIndex(x=>x[1]?.includes('pg_advisory_xact_lock'));
 const headAt=spy.findIndex(x=>x[1]?.includes('SELECT event_hash'));
 const insertAt=spy.findIndex(x=>x[1]?.includes('INSERT INTO audit_events'));
 assert(lockAt>1&&headAt>lockAt&&insertAt>headAt);
 assert.equal(spy[insertAt][2][1],user.organizationId);
});
test('audit.verify scopes and authorizes within the same transaction as hash verification',async()=>{
 const spy=[];const AuditService=loadAudit(spy);const user={id:crypto.randomUUID(),organizationId:crypto.randomUUID()};
 const timestamp='2026-11-11T00:00:00.000Z',detail={ok:true};
 const chainHash=crypto.createHash('sha256').update(JSON.stringify([user.organizationId,user.id,'CHECK','asset','a1',detail,timestamp,'GENESIS'])).digest('hex');
 const events=[{id:'e1',organization_id:user.organizationId,actor_id:user.id,action:'CHECK',entity_type:'asset',entity_id:'a1',detail,created_at:timestamp,previous_hash:'GENESIS',event_hash:chainHash}];
 const db={query:()=>{throw Error('Unscoped pool query forbidden')},tenantQuery:()=>{throw Error('Independent RLS query forbidden')},
  transaction:async(fn)=>fn({query:async(sql,params)=>{spy.push(['query',sql,params]);return {rows:sql.includes('FROM audit_events')?events:[]};}})};
 const result=await new AuditService(db).verify(user);
 assert.equal(result.verified,true);assert.equal(result.checked,1);
 assert.equal(spy[0][0],'setTenantScope');
 assert(spy.findIndex(e=>e[0]==='currentAdminRoleLocked')<spy.findIndex(e=>e[1]?.includes('FROM audit_events')));
});
test('audit.list uses same scoped authorized transaction and never unscoped pool',async()=>{
 const spy=[];const AuditService=loadAudit(spy);const user={id:crypto.randomUUID(),organizationId:crypto.randomUUID()};
 const db={query:()=>{throw Error('Unsafe pool query')},tenantQuery:()=>{throw Error('Separate scoped query')},
  transaction:async(fn)=>fn({query:async(sql,params)=>{spy.push(['query',sql,params]);return {rows:sql.includes('FROM audit_events')?[{id:'e1'}]:[]};}})};
 assert.equal((await new AuditService(db).list(user)).length,1);
 assert.equal(spy[0][0],'setTenantScope');
 assert(spy.findIndex(e=>e[0]==='currentAdminRoleLocked')<spy.findIndex(e=>e[1]?.includes('LIMIT 100')));
});
test('integrations local proof checks current admin and tenant scope in the audit-head transaction',()=>{
 const s=read('apps/api/src/integrations.ts');
 assert.match(s,/this\.db\.transaction\(async tx=>/);
 assert.match(s,/await setTenantScope\(tx,user\.organizationId\)/);
 assert.match(s,/await requireCurrentOrganizationAdmin\(tx,user\)/);
 assert.match(s,/tx\.query\('SELECT event_hash,event_sequence,created_at FROM audit_events/);
 assert(!/this\.db\.query\('SELECT event_hash,event_sequence,created_at FROM audit_events/.test(s));
});
test('operator platform bootstrap sets transaction-local tenant context before reading audit chain head',()=>{
 const s=read('tools/bootstrap-platform-admin-v28.mjs');
 const scope=s.indexOf("SELECT set_config('assettrust.tenant_id',$1,true)");
 const head=s.indexOf('SELECT event_hash FROM audit_events');
 assert(scope>0&&head>scope);assert(s.indexOf("await db.query('BEGIN')")<scope);
});
test('all direct API audit event accesses have a reviewed tenant-scoped access boundary',()=>{
 const base=path.join(root,'apps/api/src'),hits=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);
  else if(entry.name.endsWith('.ts')&&/\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:public\.)?audit_events\b/i.test(fs.readFileSync(file,'utf8')))
   hits.push(path.relative(base,file).replaceAll('\\','/'));
 }}walk(base);
 assert.deepEqual(hits.sort(),['audit.ts','integrations.ts']);
});
test('production startup and restricted runtime contract require all eight RLS tables',()=>{
 const database=read('apps/api/src/database.ts');
 assert(database.includes("'public.audit_events'::regclass"));assert(Number(database.match(/tables\.length!==(\d+)/)?.[1])>=8,'the original eight RLS tables must remain protected');
 const {REQUIRED_RLS_TABLES}=require('../runtime-role-policy-v57.cjs');
 assert(REQUIRED_RLS_TABLES.length>=8);assert(REQUIRED_RLS_TABLES.includes('audit_events'));
 assert(read('tools/test-ci-runtime-role-v57.mjs').includes('REQUIRED_RLS_TABLES.map'), 'live runtime check must use the complete current RLS inventory');
});
test('v0.61 live database contract rejects non-disposable invocation before loading pg',()=>{
 const file=read('tools/e2e-pg-audit-rls-v61.mjs');
 assert(file.indexOf('validateDisposablePgTarget(process.env)')<file.indexOf("await import('pg')"));
 assert(file.includes('validateRuntimeDatabaseUrls('));assert(file.includes('ASSETTRUST_V61_AUDIT_RLS_CONFIRM'));
 for(const term of ['RUNTIME_ROLE','COMMIT','ROLLBACK','SAVEPOINT','tenant_id','audit_events','independentConnections:true',"e?.code==='42501'"])
  assert(file.includes(term),term);
 const p=cp.spawnSync(process.execPath,['tools/e2e-pg-audit-rls-v61.mjs'],{cwd:root,env:{PATH:process.env.PATH,CI:'false',DATABASE_URL:'postgresql://fake:super_secret@example.com/production'},encoding:'utf8',timeout:6000});
 assert.notEqual(p.status,0);assert.match(p.stderr,/BLOCKED/);assert(!p.stderr.includes('super_secret'));
});
test('CI validates v0.61 after npm ci, then tests audit RLS after role privilege audit',()=>{
 const pre=workflow.indexOf('npm run verify:v61'),install=workflow.indexOf('run: npm ci');
 const privileges=workflow.indexOf('run: npm run test:pg:runtime-privileges:v60');
 const audit=workflow.indexOf('run: npm run test:pg:audit-rls:v61');
 const seed=workflow.indexOf('run: npm run test:pg:runtime-tenant-isolation:v58');
 assert(pre>install);assert(privileges>=0&&audit>privileges&&seed>audit);
 assert(workflow.includes('ASSETTRUST_V61_AUDIT_RLS_CONFIRM: YES'));
 assert(!/continue-on-error:\s*true|\|\|\s*true/.test(workflow));
 assert(require('../ci-completeness-v41.cjs').validateCi().ok);
});
test('supervised database runner explicitly prioritizes audit security after role grants',()=>{
 const {dbSteps}=require('../release-validation-v51.cjs');
 const list=dbSteps(manifest).map(x=>x.name);
 assert(list.indexOf('test:pg:runtime-privileges:v60')<list.indexOf('test:pg:audit-rls:v61'));
 assert(list.indexOf('test:pg:audit-rls:v61')<list.indexOf('test:pg:runtime-tenant-isolation:v58'));
});
test('CI runtime role has read and append privilege but cannot update or delete audit records',()=>{
 const privilege=require('../runtime-privilege-policy-v60.cjs');
 assert.equal(privilege.EXPECTED.audit_read,true);assert.equal(privilege.EXPECTED.audit_insert,true);
 assert.equal(privilege.EXPECTED.audit_update,false);assert.equal(privilege.EXPECTED.audit_delete,false);
 const provisioning=read('tools/provision-ci-runtime-role-v57.mjs');
 assert(provisioning.includes('REVOKE UPDATE,DELETE ON TABLE public.audit_events'));
});
test('three workspace versions are aligned and v0.61 scripts are present',()=>{
 for(const name of ['package.json','apps/api/package.json','apps/web/package.json'])
  assert(Number(JSON.parse(read(name)).version.split('.')[1])>=61,'later workspace versions must retain v0.61 checks');
 assert.equal(manifest.scripts['verify:v61'],'node --test tools/tests-v61/*.test.cjs');
 assert.equal(manifest.scripts['test:pg:audit-rls:v61'],'node tools/e2e-pg-audit-rls-v61.mjs');
});
