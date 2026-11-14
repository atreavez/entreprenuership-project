'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const diag=require('../runtime-diagnostics-v65.cjs');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function transpile(p,imports={}){
 const result=ts.transpileModule(read(p),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false},reportDiagnostics:true});
 assert.equal(result.diagnostics.length,0);
 const mod={exports:{}};
 const ctx={module:mod,exports:mod.exports,require(name){if(!(name in imports))throw new Error('Unexpected import '+name);return imports[name];},Error,Promise};
 vm.runInNewContext(result.outputText,ctx,{timeout:3000});return mod.exports;
}
const manifest=transpile('apps/api/src/contexts/platform/domain/schema-manifest.ts');
const domain=transpile('apps/api/src/contexts/platform/domain/schema-readiness.ts',{'./schema-manifest':manifest});
const coordinator=transpile('apps/api/src/contexts/platform/domain/readiness-coordinator.ts');
const infra=transpile('apps/api/src/contexts/platform/infrastructure/schema-probe.ts',{
 '@nestjs/common':{Injectable:()=>cls=>cls,ServiceUnavailableException:class extends Error{}},
 '../../../database':{},'../domain/schema-readiness':domain,'../domain/readiness-coordinator':coordinator,
});
function probe({postgis=true,tables=manifest.REQUIRED_POSTGIS_TABLES,migrations=manifest.REQUIRED_SCHEMA_MIGRATIONS,throwError=false}={}){
 const db={assertRuntimeIsolation:async()=>({policiesVerified:16,tablesVerified:13}),query:async sql=>{
  if(throwError)throw Error('credentials-in-database-error-should-not-leak');
  if(sql.includes('pg_extension'))return {rowCount:postgis?1:0};
  if(sql.includes('pg_tables'))return {rows:tables.map(tablename=>({tablename}))};
  if(sql.includes('assettrust_schema_migrations'))return {rows:migrations};
  throw Error('Unexpected query');
 }};
 return new infra.SchemaProbe(db);
}
test('genuine schema readiness exposes 27 verified migrations, only after hash checks pass',async()=>{
 const result=await probe().check();assert.equal(result.ready,true);
 assert.equal(result.verifiedMigrations,27);assert.equal(manifest.REQUIRED_SCHEMA_MIGRATIONS.length,27);
});
test('missing/altered PostgreSQL migration does NOT expose a verified count',async()=>{
 for(const migrations of [manifest.REQUIRED_SCHEMA_MIGRATIONS.slice(0,-1),
  manifest.REQUIRED_SCHEMA_MIGRATIONS.map((m,i)=>i===0?{...m,sha256:'0'.repeat(64)}:m),
  [...manifest.REQUIRED_SCHEMA_MIGRATIONS,manifest.REQUIRED_SCHEMA_MIGRATIONS[0]]]){
  const state=await probe({migrations}).check();assert.equal(state.ready,false);assert.equal(state.verifiedMigrations,undefined);
 }
});
test('missing required table or PostGIS rejects readiness',async()=>{
 assert.equal((await probe({tables:[]}).check()).ready,false);
 assert.equal((await probe({postgis:false}).check()).ready,false);
});
test('database failures are fail-closed and do not disclose raw errors',async()=>{
 const status=await probe({throwError:true}).check();assert.equal(status.ready,false);
 assert.doesNotMatch(JSON.stringify(status),/credentials-in-database-error/);
 await assert.rejects(probe({throwError:true}).assertReady(),/not ready/);
});
test('readyz contract publishes backend version and migration count only after SchemaProbe.assertReady',()=>{
 const src=read('apps/api/src/main.ts');
 assert.match(src,/const state=await this\.schema\.check\(\)/);
 assert.match(src,/if\(!state\.ready\)throw new ServiceUnavailableException/);
 assert.match(src,/migrationsVerified:state\.verifiedMigrations/);
 assert.match(src,/version:API_VERSION/);
});
test('readiness UI removes stale v0.11 and hard-coded seven-migration assurance',()=>{
 const src=read('apps/web/src/DeploymentReadinessPage.tsx');
 assert.doesNotMatch(src,/v0\.11|7 checksummed/);
 assert.match(src,/migrationsVerified/);assert.match(src,/API v\$\{status\.version\}/);
});
test('readiness UI treats integrations as independent so a 403 does not reset ready state',()=>{
 const src=read('apps/web/src/DeploymentReadinessPage.tsx');
 const start=src.indexOf("if(role==='ORG_ADMIN')try");
 const stop=src.indexOf('}catch(e:any)',start);
 assert(start>0&&stop>start,'Independent catch required before readiness catch');
 assert.match(src.slice(start,stop+260),/setIntegrationError/);
 assert.doesNotMatch(src.slice(start,stop),/NOT_READY/);
});
test('three workspace versions agree and migration source SHA-256 matches reviewed manifest',()=>{
 const v=diag.versionConsistency(root);assert(Number(v.version.split('.')[1])>=65);assert.equal(v.consistent,true);
 const m=diag.sourceMigrations(root);assert.equal(m.sourceCount,27);assert.equal(m.manifestCount,27);assert.equal(m.hashesMatch,true);
});
test('read-only diagnostic reports facts without claiming live test or production approval',()=>{
 const result=diag.inspect(root,{PATH:'',DATABASE_URL:'postgres://secret:password@127.0.0.1/assettrust_ci',ASSETTRUST_RUNTIME_DATABASE_URL:'postgres://other:password@127.0.0.1/assettrust_ci'});
 assert.equal(result.productionApproved,false);assert.equal(result.liveDatabaseTested,false);
 assert.equal(result.fullBuildTested,false);assert.equal(result.checks.operatorAndRuntimeDatabaseUrlsConfigured,true);
 assert.doesNotMatch(JSON.stringify(result),/secret:password|other:password/);
});
test('runtime diagnosis uses no child processes, network or dynamic database connections',()=>{
 const src=read('tools/runtime-diagnostics-v65.cjs');
 assert.doesNotMatch(src,/require\(['"](?:node:)?(?:child_process|net|http|https|pg)['"]\)/);
 assert.doesNotMatch(src,/spawnSync|execSync|\.connect\(/);
});
test('diagnosis inspect never writes files',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v65-readonly-'));
 diag.inspect(d,{PATH:''});assert.deepEqual(fs.readdirSync(d),[]);
 fs.rmSync(d,{recursive:true,force:true});
});
test('diagnostic reports modified migration hash mismatch without executing SQL',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v65-hash-'));
 const sql=path.join(d,'apps/api/sql');fs.mkdirSync(sql,{recursive:true});
 const manifestDir=path.join(d,'apps/api/src/contexts/platform/domain');fs.mkdirSync(manifestDir,{recursive:true});
 fs.writeFileSync(path.join(sql,'001_example.sql'),'BEGIN;\nSELECT 1;\nCOMMIT;\n');
 const good=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(sql,'001_example.sql'))).digest('hex');
 fs.writeFileSync(path.join(manifestDir,'schema-manifest.ts'),`export const REQUIRED_SCHEMA_MIGRATIONS = [{filename: '001_example.sql', sha256: '${good}'}];`);
 assert.equal(diag.sourceMigrations(d).hashesMatch,true);
 fs.appendFileSync(path.join(sql,'001_example.sql'),'-- unexpected mutation\n');
 assert.equal(diag.sourceMigrations(d).hashesMatch,false);
 fs.rmSync(d,{recursive:true,force:true});
});
test('diagnostic writer creates a 0600 evidence artifact without exposing environment credentials',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v65-write-'));
 const env={PATH:'',DATABASE_URL:'postgres://secret:password@127.0.0.1/assettrust_test',JWT_SECRET:'very-private-secret'};
 const result=diag.inspect(d,env);const filename=diag.write(d,result);
 const target=path.join(d,filename);
 assert.equal(fs.statSync(target).mode&0o777,0o600);
 assert.doesNotMatch(fs.readFileSync(target,'utf8'),/secret:password|very-private-secret/);
 fs.rmSync(d,{recursive:true,force:true});
});
test('diagnostic writer refuses linked directory and linked output file',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v65-unsafe-'));
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v65-target-'));
 fs.symlinkSync(out,path.join(d,'test-evidence'));
 assert.throws(()=>diag.write(d,diag.inspect(d,{})),/Unsafe evidence directory/);
 assert.equal(fs.readdirSync(out).length,0);
 fs.unlinkSync(path.join(d,'test-evidence'));fs.mkdirSync(path.join(d,'test-evidence/v65'),{recursive:true});
 fs.symlinkSync(path.join(out,'victim'),path.join(d,'test-evidence/v65/runtime-diagnostic.json'));
 assert.throws(()=>diag.write(d,diag.inspect(d,{})),/Unsafe evidence file/);
 assert.equal(fs.existsSync(path.join(out,'victim')),false);
 fs.rmSync(d,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true});
});
test('unsafe mode arguments are rejected before inspection',()=>{
 const proc=require('node:child_process').spawnSync(process.execPath,['tools/runtime-diagnostics-v65.cjs','--connect'],{cwd:root,encoding:'utf8',timeout:3500});
 assert.notEqual(proc.status,0);assert.match(proc.stderr,/BLOCKED/);
});
test('CI runs v65 tests only after authentic npm install and contains scripts',()=>{
 const ci=read('.github/workflows/ci.yml'),pkg=JSON.parse(read('package.json'));
 assert(ci.indexOf('npm run verify:v65')>ci.indexOf('run: npm ci'));
 for(const s of ['verify:v65','diagnose:inspect:v65','diagnose:evidence:v65'])assert(pkg.scripts[s]);
});
