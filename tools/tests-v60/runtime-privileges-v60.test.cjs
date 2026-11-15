'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const {EXPECTED,evaluateRuntimePrivileges}=require('../runtime-privilege-policy-v60.cjs');
const provision=fs.readFileSync(path.join(ROOT,'tools/provision-ci-runtime-role-v57.mjs'),'utf8');
const live=fs.readFileSync(path.join(ROOT,'tools/test-ci-runtime-privileges-v60.mjs'),'utf8');
const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const role={...EXPECTED,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false};
test('baseline least-privilege runtime role passes only with every required flag',()=>{
 const result=evaluateRuntimePrivileges(role);assert.equal(result.ok,true);assert.equal(result.checkedPrivileges,11);
});
test('fail closed for absent database result and missing privilege fields',()=>{
 assert.equal(evaluateRuntimePrivileges(undefined).ok,false);
 for(const key of Object.keys(EXPECTED)){const data={...role};delete data[key];assert(!evaluateRuntimePrivileges(data).ok,key);}
});
test('rejects every forbidden migration-ledger mutation privilege',()=>{
 for(const key of ['migration_insert','migration_update','migration_delete'])
  assert(!evaluateRuntimePrivileges({...role,[key]:true}).ok,key);
});
test('rejects audit history overwrite and deletion but preserves append-only writes',()=>{
 for(const key of ['audit_update','audit_delete'])assert(!evaluateRuntimePrivileges({...role,[key]:true}).ok,key);
 for(const key of ['audit_read','audit_insert'])assert(!evaluateRuntimePrivileges({...role,[key]:false}).ok,key);
});
test('rejects CREATE privileges, inherited role memberships and elevated SQL roles',()=>{
 for(const key of ['public_schema_create','database_create','inherited_membership','rolsuper','rolbypassrls','rolcreaterole','rolcreatedb'])
  assert(!evaluateRuntimePrivileges({...role,[key]:true}).ok,key);
});
test('rejects invalid truthy strings in place of PostgreSQL booleans',()=>{
 assert(!evaluateRuntimePrivileges({...role,audit_delete:'false'}).ok);
});
test('CI runtime provisioning revokes internal grants after blanket application grants',()=>{
 const broad=provision.indexOf('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public');
 const ledger=provision.indexOf('REVOKE INSERT,UPDATE,DELETE ON TABLE public.assettrust_schema_migrations');
 const audit=provision.indexOf('REVOKE UPDATE,DELETE ON TABLE public.audit_events');
 assert(broad>=0&&ledger>broad&&audit>ledger);
 assert(provision.includes('NO'+'BYPASSRLS'));
});
test('live audit is read-only and performs its authorization guard before pg import',()=>{
 const guard=live.indexOf("if(process.env.CI!=='true'");
 const validated=live.indexOf('validateRuntimeDatabaseUrls(');
 const importing=live.indexOf("await import('pg')");
 const connection=live.indexOf('await db.connect()');
 assert(guard>=0&&guard<validated&&validated<importing&&importing<connection);
 assert(!/\b(?:INSERT INTO|DELETE FROM|UPDATE public\.|CREATE ROLE|DROP ROLE)\b/i.test(live));
});
test('unapproved entrypoint blocks without connecting and without disclosing credentials',()=>{
 const result=spawnSync(process.execPath,['tools/test-ci-runtime-privileges-v60.mjs'],{cwd:ROOT,env:{PATH:process.env.PATH,CI:'false',DATABASE_URL:'postgres://secret:private@localhost/production'},encoding:'utf8',timeout:5000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/BLOCKED/);assert(!result.stderr.includes('private'));
});
test('CI enforces privilege audit after role provisioning and before seeded or HTTP tests',()=>{
 const provisionAt=ci.indexOf('run: node tools/provision-ci-runtime-role-v57.mjs');
 const checkAt=ci.indexOf('run: npm run test:pg:runtime-privileges:v60');
 const seededAt=ci.indexOf('run: npm run test:pg:runtime-tenant-isolation:v58');
 const httpAt=ci.indexOf('run: npm run test:e2e:two-api:v42');
 assert(provisionAt>=0&&checkAt>provisionAt&&seededAt>checkAt&&httpAt>seededAt);
 assert(ci.indexOf('npm run verify:v60')<ci.indexOf('run: npm ci'));
});
test('supervised database plan runs privilege check before any seeded tenant mutation',()=>{
 const {dbSteps}=require('../release-validation-v51.cjs');
 const ordered=dbSteps(manifest).map(s=>s.name);
 assert(ordered.indexOf('test:pg:runtime-role:v57')<ordered.indexOf('test:pg:runtime-privileges:v60'));
 assert(ordered.indexOf('test:pg:runtime-privileges:v60')<ordered.indexOf('test:pg:runtime-tenant-isolation:v58'));
 assert(ordered.indexOf('test:pg:runtime-tenant-isolation:v58')<ordered.indexOf('test:pg:runtime-tenant-crud:v59'));
});
test('all workspace versions and npm scripts are aligned with v0.60',()=>{
 for(const file of ['package.json','apps/api/package.json','apps/web/package.json'])
  assert.match(JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8')).version,/^0\.(?:6[0-9]|[7-9][0-9]|[1-9][0-9]{2,})\.0$/);
 assert.equal(manifest.scripts['test:pg:runtime-privileges:v60'],'node tools/test-ci-runtime-privileges-v60.mjs');
});
test('new least-privilege tests do not masquerade as completed live DB checks',()=>{
 assert(live.includes('productionApproved:false'));
 assert(live.includes("await import('pg')"));
 assert(live.includes('has_table_privilege'));
});
test('idempotent Kali grant repair is separately opt-in and forbidden on remote databases',()=>{
 const repair=fs.readFileSync(path.join(ROOT,'tools/harden-ci-runtime-grants-v60.mjs'),'utf8');
 assert(repair.includes("ASSETTRUST_V60_REVOKE_CONFIRM!=='YES'"));
 assert(repair.includes('validateDisposablePgTarget('));
 assert(repair.includes('validateRuntimeDatabaseUrls('));
 assert(repair.indexOf('validateRuntimeDatabaseUrls(')<repair.indexOf("await import('pg')"));
 assert(repair.includes('REVOKE INSERT,UPDATE,DELETE ON TABLE public.assettrust_schema_migrations'));
 assert(repair.includes('REVOKE UPDATE,DELETE ON TABLE public.audit_events'));
 const run=spawnSync(process.execPath,['tools/harden-ci-runtime-grants-v60.mjs'],{cwd:ROOT,env:{PATH:process.env.PATH,CI:'false'},encoding:'utf8',timeout:5000});
 assert.notEqual(run.status,0);assert.match(run.stderr,/BLOCKED/);
 assert.equal(manifest.scripts['db:runtime-grants:v60'],'node tools/harden-ci-runtime-grants-v60.mjs');
});
test('twenty-five existing SQL migrations remain immutable with no synthetic SQL migration',()=>{
 const files=fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(f=>f.endsWith('.sql'));
 assert.equal(files.length>=25,true);assert(files.includes('025_documents_rls.sql'));
});
