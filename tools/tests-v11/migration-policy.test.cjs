'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {buildPlan,stripTransactionEnvelope,validateLedger}=require('../migrations/plan.cjs');
const {run,verifyLegacySchema,EXPECTED_LEGACY_TABLES,EXPECTED_LEGACY_COLUMNS}=require('../migrations/run.cjs');
const migrations=buildPlan();
test('repository migration plan is contiguous and has stable SHA-256 hashes',()=>{
 assert.ok(migrations.length>=11,'Versioned migrations must append, not remove the original eleven');
 migrations.forEach((m,i)=>{assert.ok(m.filename.startsWith(String(i+1).padStart(3,'0')));assert.match(m.sha256,/^[a-f0-9]{64}$/);assert.ok(m.sql.length>25)});
});
test('strip controlled transaction envelope only',()=>{
 assert.equal(stripTransactionEnvelope('BEGIN;\nSELECT 1;\nCOMMIT;','001_test.sql'),'SELECT 1;');
 assert.throws(()=>stripTransactionEnvelope('SELECT 1;','001_test.sql'),/single explicit/);
 assert.throws(()=>stripTransactionEnvelope('BEGIN;\nCOMMIT;\nCOMMIT;','001_test.sql'),/nested/);
 assert.throws(()=>stripTransactionEnvelope('BEGIN;\n\nCOMMIT;','001_test.sql'),/empty/);
});
test('migration plan rejects gaps and unknown SQL names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-mig-'));
 try{fs.writeFileSync(path.join(dir,'001_a.sql'),'BEGIN;\nSELECT 1;\nCOMMIT;');fs.writeFileSync(path.join(dir,'003_c.sql'),'BEGIN;\nSELECT 3;\nCOMMIT;');assert.throws(()=>buildPlan(dir),/Missing or duplicate/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('migration plan rejects changes in applied SQL',()=>{
 const applied=migrations.map(m=>({filename:m.filename,sha256:m.sha256}));
 assert.deepEqual(validateLedger(migrations,applied),[]);
 assert.equal(validateLedger(migrations,applied.slice(0,5)).length,migrations.length-5);
 assert.throws(()=>validateLedger(migrations,[{...applied[0],sha256:'0'.repeat(64)}]),/checksum mismatch/);
 assert.throws(()=>validateLedger(migrations,[{filename:'000_rogue.sql',sha256:'0'.repeat(64)}]),/Unknown/);
 assert.throws(()=>validateLedger(migrations,[applied[0],applied[2]]),/noncontiguous/);
 assert.throws(()=>validateLedger(migrations,[applied[0],applied[0]]),/Duplicate/);
});
class FakePg{
 constructor({legacy=false,fullLegacy=false,failOn}={}){this.legacy=legacy;this.fullLegacy=fullLegacy;this.failOn=failOn;this.applied=[];this.connected=false;this.ledger=false;this.calls=[];this.inTxn=false;this.pending=[];this.tables=fullLegacy?new Set(EXPECTED_LEGACY_TABLES):(legacy?new Set(['organizations','users']):new Set());}
 async connect(){this.connected=true;}
 async end(){this.connected=false;}
 async query(sql,args=[]){this.calls.push({sql,args});
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{acquired:true}],rowCount:1};
  if(sql.includes('pg_advisory_unlock'))return {rows:[{released:true}],rowCount:1};
  if(sql==='BEGIN'){this.inTxn=true;this.pending=[];return {rows:[],rowCount:0};}
  if(sql==='ROLLBACK'){this.inTxn=false;this.pending=[];return {rows:[],rowCount:0};}
  if(sql==='COMMIT'){this.applied.push(...this.pending);this.pending=[];this.inTxn=false;return {rows:[],rowCount:0};}
  if(sql.includes('SELECT tablename FROM pg_catalog.pg_tables'))return {rows:[...this.tables,...(this.ledger?['assettrust_schema_migrations']:[])].map(tablename=>({tablename}))};
  if(sql.includes("SELECT 1 FROM pg_extension WHERE extname='postgis'"))return {rows:this.fullLegacy?[{exists:1}]:[],rowCount:this.fullLegacy?1:0};
  if(sql.includes('FROM information_schema.columns'))return {rows:this.fullLegacy?EXPECTED_LEGACY_COLUMNS.map(([table_name,column_name])=>({table_name,column_name})):[],rowCount:0};
  if(sql.includes('CREATE TABLE IF NOT EXISTS assettrust_schema_migrations')){this.ledger=true;return {rows:[],rowCount:0};}
  if(sql.includes('SELECT filename,sha256 FROM assettrust_schema_migrations')){if(!this.ledger)throw new Error('missing ledger');return {rows:this.applied,rowCount:this.applied.length};}
  if(sql.includes('INSERT INTO assettrust_schema_migrations')){this.pending.push({filename:args[0],sha256:args[1]});return {rows:[],rowCount:1};}
  if(this.failOn&&sql.includes(this.failOn))throw new Error('simulated SQL failure');
  return {rows:[],rowCount:0};
 }
}
test('fresh migrate is serial, atomic per file, idempotent and checkable',async()=>{
 const pg=new FakePg();
 const factory=()=>pg;
 const first=await run({clientFactory:factory,quiet:true});assert.equal(first.applied,migrations.length);assert.equal(pg.applied.length,migrations.length);
 assert.equal(pg.calls.filter(c=>c.sql==='BEGIN').length,migrations.length);
 assert.equal(pg.calls.filter(c=>c.sql==='COMMIT').length,migrations.length);
 assert.equal(pg.calls.filter(c=>c.sql.includes('pg_try_advisory_lock')).length,1);
 assert.equal(pg.connected,false);
 const again=await run({clientFactory:factory,quiet:true});assert.equal(again.applied,0);
 const check=await run({clientFactory:factory,check:true,quiet:true});assert.equal(check.checked,migrations.length);
});
test('migration failure rolls back ledger and leaves pending migrations unapplied',async()=>{
 const pg=new FakePg({failOn:'CREATE EXTENSION IF NOT EXISTS postgis'});
 await assert.rejects(()=>run({clientFactory:()=>pg,quiet:true}),/007_geospatial.sql failed/);
 assert.equal(pg.applied.length,6);assert.equal(pg.connected,false);
 assert.ok(pg.calls.some(c=>c.sql==='ROLLBACK'));
 await assert.rejects(()=>run({clientFactory:()=>pg,check:true,quiet:true}),/pending migrations/);
});
test('pre-existing legacy schema is never silently baselined',async()=>{
 const pg=new FakePg({legacy:true});
 await assert.rejects(()=>run({clientFactory:()=>pg,quiet:true}),/Legacy database has no migration ledger/);
 assert.equal(pg.ledger,false);assert.equal(pg.applied.length,0);
});
test('baseline refuses without backup acknowledgment',async()=>{
 const pg=new FakePg({legacy:true});
 await assert.rejects(()=>run({clientFactory:()=>pg,baseline:true,quiet:true}),/requires .* BACKUP|requires ASSETTRUST/);
 assert.equal(pg.ledger,false);
});
test('legacy baseline refuses incomplete schemas even with backup consent',async()=>{
 const pg=new FakePg({legacy:true});
 const old1=process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA,old2=process.env.ASSETTRUST_BACKUP_CONFIRMED;
 try{process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA='YES';process.env.ASSETTRUST_BACKUP_CONFIRMED='YES';await assert.rejects(()=>run({clientFactory:()=>pg,baseline:true,quiet:true}),/incomplete legacy schema/);}
 finally{if(old1===undefined)delete process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA;else process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA=old1;if(old2===undefined)delete process.env.ASSETTRUST_BACKUP_CONFIRMED;else process.env.ASSETTRUST_BACKUP_CONFIRMED=old2;}
});

test('verified legacy schema baseline is explicit, transactionally recorded and does not rerun old SQL',async()=>{
 const pg=new FakePg({fullLegacy:true});
 const old1=process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA,old2=process.env.ASSETTRUST_BACKUP_CONFIRMED;
 try{
  process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA='YES';process.env.ASSETTRUST_BACKUP_CONFIRMED='YES';
  const outcome=await run({clientFactory:()=>pg,baseline:true,quiet:true});
  assert.equal(outcome.baselined,8);assert.equal(pg.applied.length,8);assert.equal(pg.calls.filter(x=>x.sql==='BEGIN').length,1);
  assert.ok(!pg.calls.some(x=>x.sql.includes('CREATE EXTENSION IF NOT EXISTS postgis')));
  await assert.rejects(()=>run({clientFactory:()=>pg,check:true,quiet:true}),/pending migrations/);
  assert.equal((await run({clientFactory:()=>pg,quiet:true})).applied,migrations.length-8);
  assert.equal((await run({clientFactory:()=>pg,check:true,quiet:true})).checked,migrations.length);
 }finally{if(old1===undefined)delete process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA;else process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA=old1;if(old2===undefined)delete process.env.ASSETTRUST_BACKUP_CONFIRMED;else process.env.ASSETTRUST_BACKUP_CONFIRMED=old2;}
});
