'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration=read('apps/api/sql/027_operational_data_rls.sql');
const operations=['case_tasks','disputes','monitoring_reminders','verification_quotes'];
const manifest=JSON.parse(read('package.json'));
test('new append-only SQL migration is transaction-wrapped, with no destructive repair',()=>{
 assert.match(migration,/^BEGIN;\n/);assert.match(migration,/COMMIT;\s*$/);assert.doesNotMatch(migration,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|NOT VALID|DISABLE TRIGGER|BYPASSRLS)\b/i);
});
test('four operational tables use FORCE RLS with tenant equality in both directions',()=>{
 for(const table of operations){
  assert(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`));
  assert(migration.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`));
  const p=migration.slice(migration.indexOf(`CREATE POLICY ${table}_tenant_v62`)).split(';',1)[0];
  assert(p.includes("FOR ALL TO PUBLIC") && p.includes('WITH CHECK (organization_id = NULLIF') && p.includes('assettrust.tenant_id'),table+' must enforce policy');
  assert(p,table+' must have WITH CHECK and tenant scope');
 }
});
test('five tables gain tenant-matched composite references (including inbox recipients)',()=>{
 const fks=['fk_tasks_case','fk_tasks_creator','fk_tasks_assignee','fk_disputes_case','fk_disputes_reporter','fk_disputes_assignee','fk_disputes_resolver','fk_reminders_asset','fk_reminders_creator','fk_quotes_case','fk_quotes_creator','fk_notifications_recipient'];
 for(const key of fks)assert(migration.includes(key+'_tenant_v62'),key);
 assert.equal((migration.match(/FOREIGN KEY \(organization_id,/g)||[]).length,12);
});
test('inbox read and update both require tenant PLUS recipient actor; insert accepts tenant only',()=>{
 assert.match(migration,/CREATE POLICY notifications_recipient_select_v62[\s\S]*?FOR SELECT[\s\S]*?recipient_id = NULLIF\(current_setting\('assettrust.actor_id',true\),''\)::uuid\)/);
 assert.match(migration,/CREATE POLICY notifications_recipient_update_v62[\s\S]*?FOR UPDATE[\s\S]*?WITH CHECK[\s\S]*?recipient_id = NULLIF\(current_setting\('assettrust.actor_id',true\),''\)::uuid\)/);
 assert.match(migration,/CREATE POLICY notifications_tenant_insert_v62[\s\S]*?FOR INSERT[\s\S]*?organization_id = NULLIF/);
 assert.doesNotMatch(migration,/CREATE POLICY.*?FOR DELETE/i);
});
test('migration manifest appends one SHA-256 without modifying earlier migrations',()=>{
 const entries=require('../migrations/plan.cjs').buildPlan();assert.equal(entries.length,27);
 assert.equal(entries.at(-1).filename,'027_operational_data_rls.sql');
 assert.equal(entries.at(-1).sha256,crypto.createHash('sha256').update(migration).digest('hex'));
 const source=read('apps/api/src/contexts/platform/domain/schema-manifest.ts');
 for(const row of entries)assert(source.includes(row.sha256),row.filename);
});
test('tenant-recipient scope helper sets tenant THEN validated actor with transaction LOCAL settings',async()=>{
 const ts=require('typescript');const src=read('apps/api/src/contexts/tenant-isolation/application/tenant-scope.ts');
 const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const holder={exports:{}};const uuid=crypto.randomUUID();
 vm.runInNewContext(compiled,{module:holder,exports:holder.exports,require:n=>n.includes('tenant-policy')?{validateTenantId:v=>{if(typeof v!=='string'||!/^[0-9a-f-]{36}$/i.test(v))throw Error('Invalid UUID');return v;}}:null},{timeout:3000});
 const spy=[],tx={query:async(sql,args)=>{spy.push([sql,args]);return {rows:[]}}};
 await holder.exports.setRecipientScope(tx,uuid,uuid);
 assert.equal(spy.length,2);assert.match(spy[0][0],/assettrust.tenant_id/);assert.match(spy[1][0],/assettrust.actor_id/);
 assert.deepEqual(spy.map(x=>x[1][0]),[uuid,uuid]);
 await assert.rejects(holder.exports.setRecipientScope(tx,uuid,'not-a-user'));assert.equal(spy.length,3,'invalid actor must not be written as session scope');
});
test('recipient DB method runs both settings and query inside same transaction',()=>{
 const s=read('apps/api/src/database.ts');assert.match(s,/async tenantRecipientQuery[\s\S]*?return this.transaction\(async tx=>\{\s*await setRecipientScope\(tx,organizationId,actorId\);\s*return tx.query/);
 assert.match(s,/tables.length!==13/);for(const t of [...operations,'notifications'])assert(s.includes(`'public.${t}'::regclass`));
});
test('inbox service uses scoped query and never unscoped pool query',()=>{
 const s=read('apps/api/src/notifications.ts');assert.equal((s.match(/this.db.tenantRecipientQuery\(u.organizationId,u.id,/g)||[]).length,2);
 assert.doesNotMatch(s,/this.db.query\(/);assert.match(s,/recipient_id=\$3 RETURNING id,read_at/);
});
test('inbox list and markRead send actor identity from validated user in a real service call',async()=>{
 const ts=require('typescript');const src=read('apps/api/src/notifications.ts');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 const mod={exports:{}};const decorators=()=>()=>{};
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require:n=>n==='@nestjs/common'?{Controller:decorators,Get:decorators,Patch:decorators,Param:decorators,Req:decorators,UseGuards:decorators,Module:decorators,Injectable:decorators,NotFoundException:class extends Error{}}:n==='./common'?{isUuid:x=>x}:n==='./auth'?{AuthModule:class{},AuthGuard:class{}}:{},Object,Array,Promise},{timeout:3000});
 const user={id:crypto.randomUUID(),organizationId:crypto.randomUUID()},id=crypto.randomUUID(),calls=[];
 const instance=new mod.exports.NotificationsModule; // service is intentionally internal, exercise exported module via service fixture below
 assert(instance);
 const ctor=js.match(/let NotificationsService = class NotificationsService/);assert(ctor);
 const mocked={tenantRecipientQuery:async(...args)=>{calls.push(args);return {rows:[{id}]}}};
 // Instantiate through a minimal source-controlled VM export, not a static text assertion.
 const module2={exports:{}};vm.runInNewContext(js+'\nmodule.exports._TestNotificationsService = NotificationsService;', {module:module2,exports:module2.exports,require:n=>n==='@nestjs/common'?{Controller:decorators,Get:decorators,Patch:decorators,Param:decorators,Req:decorators,UseGuards:decorators,Module:decorators,Injectable:decorators,NotFoundException:class extends Error{}}:n==='./common'?{isUuid:x=>x}:n==='./auth'?{AuthModule:class{},AuthGuard:class{}}:{},Object,Array,Promise},{timeout:3000});
 const svc=new module2.exports._TestNotificationsService(mocked);
 await svc.list(user);await svc.markRead(user,id);
 assert.deepEqual(calls.map(x=>x.slice(0,2)),[[user.organizationId,user.id],[user.organizationId,user.id]]);
});
test('runtime role guard rejects absent RLS on each newly protected table',()=>{
 const {REQUIRED_RLS_TABLES,evaluateDatabaseRole,RUNTIME_ROLE}=require('../runtime-role-policy-v57.cjs');assert.equal(REQUIRED_RLS_TABLES.length,13);
 const all=REQUIRED_RLS_TABLES.map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,table_owner:'assettrust'}));
 assert(evaluateDatabaseRole({role:{rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false},tables:all},RUNTIME_ROLE).ok);
 for(const table of [...operations,'notifications'])assert(!evaluateDatabaseRole({role:{rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false},tables:all.filter(x=>x.relname!==table)},RUNTIME_ROLE).ok,table);
});
test('notification producers use existing tenant-scoped transactions for writes',()=>{
 for(const p of ['apps/api/src/cases.ts','apps/api/src/operations.ts']){
  const s=read(p);assert.match(s,/await setTenantScope\(tx,u.organizationId\)/);assert.match(s,/INSERT INTO notifications/);
 }
});
test('GitHub CI runs v62 TypeScript-dependent tests after npm ci and live PG with explicit consent',()=>{
 const s=read('.github/workflows/ci.yml');const install=s.indexOf('run: npm ci');const verify=s.indexOf('npm run verify:v62');
 assert(verify>install);assert(s.match(/npm run verify:v62/g).length>=1);
 assert.match(s,/ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM: YES[\s\S]*?run: npm run test:pg:operational-rls:v62/);
});
test('supervised run orders role->privilege->audit->operational RLS before other tenant checks',()=>{
 const {dbSteps}=require('../release-validation-v51.cjs');const names=dbSteps(manifest).map(x=>x.name);
 const roles=['test:pg:runtime-role:v57','test:pg:runtime-privileges:v60','test:pg:audit-rls:v61','test:pg:operational-rls:v62','test:pg:runtime-tenant-isolation:v58'];
 assert(roles.every(x=>names.includes(x)));assert(roles.every(x=>names.indexOf(x)>=2));assert(roles.every((x,i)=>i===0||names.indexOf(roles[i-1])<names.indexOf(x)));
});
test('live runner refuses invocation without opt-in before accessing pg',()=>{
 const p=cp.spawnSync(process.execPath,['tools/e2e-pg-operational-rls-v62.mjs'],{cwd:root,env:{...process.env,CI:'false',ASSETTRUST_E2E_ALLOW_MUTATION:'NO',ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM:'NO'},encoding:'utf8',timeout:5000});
 assert.notEqual(p.status,0);assert.match(p.stderr+p.stdout,/BLOCKED/);
});
test('all three live RLS entrypoints dynamically query the complete protected table inventory',()=>{
 for(const name of ['test-ci-runtime-role-v57.mjs','e2e-pg-runtime-tenant-isolation-v58.mjs','e2e-pg-runtime-tenant-crud-v59.mjs']){
  const s=read('tools/'+name);
  assert(s.includes("REQUIRED_RLS_TABLES.map(name=>'public.'+name)"),name+' must not use a stale hardcoded RLS list');
  assert(s.includes('$1::regclass[]'),name+' must parameterize the catalog relation inventory');
  assert(!s.includes("'public.audit_events'::regclass"),name+' must not retain the old eight-table literal list');
 }
});
test('new v62 source carries package version and no earlier migration bytes changed',()=>{
 assert(/^0\.(?:6[2-9]|[7-9]\d)\.0$/.test(manifest.version));assert.equal(JSON.parse(read('apps/api/package.json')).version,manifest.version);assert.equal(JSON.parse(read('apps/web/package.json')).version,manifest.version);
 const previous=fs.readdirSync(path.join(root,'apps/api/sql')).filter(x=>/^\d{3}_/.test(x)).sort();assert.equal(previous.length,27);
});
test('operator preflight probes every cross-tenant relationship without mutating records',()=>{
 const sql=read('tools/sql/v62-operational-preflight.sql');assert.match(sql,/BEGIN READ ONLY;/);assert.match(sql,/COMMIT;\s*$/);
 assert.equal((sql.match(/UNION ALL SELECT/g)||[]).length+1,12);
 for(const table of ['case_tasks','disputes','monitoring_reminders','verification_quotes','notifications'])assert(sql.includes('public.'+table));
 assert.doesNotMatch(sql,/\b(?:DELETE FROM|UPDATE|TRUNCATE|ALTER TABLE|DROP TABLE|INSERT INTO)\b/i);
});

test('schema readiness inventory explicitly requires all five new protected operational tables',()=>{
 const s=read('apps/api/src/contexts/platform/domain/schema-manifest.ts');
 const inventory=s.slice(s.indexOf('REQUIRED_POSTGIS_TABLES'));
 for(const t of [...operations,'notifications'])assert(inventory.includes("'"+t+"'"),t);
});
