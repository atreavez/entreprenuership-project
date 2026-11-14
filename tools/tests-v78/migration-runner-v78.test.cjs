'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const {run,MIGRATION_LOCK_ID}=require('../migrations/run.cjs');
const {buildPlan}=require('../migrations/plan.cjs');
const ROOT=resolve(__dirname,'../..');
const plan=buildPlan();
class Pg {
 constructor(opts={}){this.opts=opts;this.calls=[];this.connected=false;this.closed=false;
  this.ledger=opts.ledger??true;this.applied=opts.applied??plan.map(m=>({filename:m.filename,sha256:m.sha256}));this.pending=[];this.tx=false;}
 async connect(){if(this.opts.connectFail)throw Error('connection unavailable');this.connected=true;}
 async end(){this.closed=true;this.connected=false;if(this.opts.endFail)throw Error('socket close failed');}
 async query(sql,params=[]){this.calls.push({sql,params});
  if(sql.includes('pg_try_advisory_lock'))return this.opts.lockMalformed?{rows:[]}:{rows:[{acquired:!this.opts.lockHeld}]};
  if(sql.includes('pg_advisory_unlock')){if(this.opts.unlockFail)throw Error('unlock unavailable');return {rows:[{released:true}]};}
  if(sql.includes('pg_catalog.pg_tables'))return {rows:this.ledger?[{tablename:'assettrust_schema_migrations'}]:[]};
  if(sql.includes('CREATE TABLE IF NOT EXISTS assettrust_schema_migrations')){this.ledger=true;return {rows:[]};}
  if(sql.includes('SELECT filename,sha256 FROM assettrust_schema_migrations'))return {rows:this.applied};
  if(sql==='BEGIN'){if(this.opts.beginFail)throw Error('begin error');this.tx=true;return {rows:[]};}
  if(sql==='ROLLBACK'){if(this.opts.rollbackFail)throw Error('rollback error');this.pending=[];this.tx=false;return {rows:[]};}
  if(sql==='COMMIT'){if(this.opts.commitFail)throw Error('commit error');this.applied.push(...this.pending);this.pending=[];this.tx=false;return {rows:[]};}
  if(sql.includes('INSERT INTO assettrust_schema_migrations')){this.pending.push({filename:params[0],sha256:params[1]});return {rows:[]};}
  if(this.opts.sqlFail&&sql.includes(this.opts.sqlFail))throw Error('source migration SQL failed');
  return {rows:[]};
 }
}
function use(pg,opts={}){return run({clientFactory:()=>pg,quiet:true,...opts});}
test('27 audited SQL migrations remain contiguous, unmodified and nonempty',()=>{
 assert.equal(plan.length,27);assert(plan.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)&&x.sql.length));
});
test('advisory lock is deterministic and PostgreSQL BIGINT parameterized',async()=>{
 const pg=new Pg();await use(pg,{check:true});const lock=pg.calls.find(x=>x.sql.includes('pg_try_advisory_lock'));
 assert.deepEqual(lock.params,[MIGRATION_LOCK_ID]);assert.equal(MIGRATION_LOCK_ID,1642872011);
 assert(pg.calls.some(x=>x.sql.includes('pg_advisory_unlock')));
});
test('contended lock refuses before any ledger/schema query and closes session',async()=>{
 const pg=new Pg({lockHeld:true});await assert.rejects(use(pg,{check:true}),/Another migration\/check/);
 assert.equal(pg.calls.length,1);assert(!pg.calls.some(x=>x.sql.includes('pg_advisory_unlock')));assert(pg.closed);
});
test('malformed/unknown lock result fails closed',async()=>{
 const pg=new Pg({lockMalformed:true});await assert.rejects(use(pg),/Another migration\/check/);
 assert.equal(pg.calls.length,1);assert(pg.closed);
});
test('connection failure closes the constructed client',async()=>{
 const pg=new Pg({connectFail:true});await assert.rejects(use(pg),/connection unavailable/);
 assert(pg.closed);assert.equal(pg.calls.length,0);
});
test('read-only full ledger check works without DDL or writes',async()=>{
 const pg=new Pg();const outcome=await use(pg,{check:true});assert.equal(outcome.checked,27);
 assert(!pg.calls.some(x=>/^(BEGIN|COMMIT|INSERT|CREATE)/.test(x.sql)));assert(pg.closed);
});
test('missing ledger under --check is a failure, no schema creation',async()=>{
 const pg=new Pg({ledger:false});await assert.rejects(use(pg,{check:true}),/ledger is missing/);
 assert(!pg.calls.some(x=>x.sql.startsWith('CREATE')));assert(pg.closed);
});
test('tampered migration checksum is never accepted as ready',async()=>{
 const applied=plan.map(x=>({filename:x.filename,sha256:x.sha256}));applied[3].sha256='0'.repeat(64);
 const pg=new Pg({applied});await assert.rejects(use(pg,{check:true}),/checksum mismatch/i);
 assert(pg.closed);
});
test('missing migration is reported, not silently baselined',async()=>{
 const pg=new Pg({applied:plan.slice(0,26).map(x=>({filename:x.filename,sha256:x.sha256}))});
 await assert.rejects(use(pg,{check:true}),/pending migrations/);assert(pg.closed);
});
test('a new database applies migrations in per-file transactions and releases lock',async()=>{
 const pg=new Pg({ledger:false,applied:[]});const result=await use(pg);
 assert.equal(result.applied,27);assert.equal(pg.applied.length,27);
 assert.equal(pg.calls.filter(x=>x.sql==='BEGIN').length,27);
 assert.equal(pg.calls.filter(x=>x.sql==='COMMIT').length,27);
 assert(pg.calls.some(x=>x.sql.includes('pg_advisory_unlock')));assert(pg.closed);
});
test('SQL execution failure rolls back and does not mark that migration applied',async()=>{
 const pg=new Pg({ledger:false,applied:[],sqlFail:'CREATE EXTENSION IF NOT EXISTS postgis'});
 await assert.rejects(use(pg),/007_geospatial.sql failed/);
 assert.equal(pg.applied.length,6);assert(pg.calls.some(x=>x.sql==='ROLLBACK'));assert(pg.closed);
});
test('rollback failure is explicit and original SQL cause is retained',async()=>{
 const pg=new Pg({ledger:false,applied:[],sqlFail:'CREATE EXTENSION IF NOT EXISTS postgis',rollbackFail:true});
 await assert.rejects(use(pg),error=>/ROLLBACK failed/.test(error.message)&&error.cause?.cause?.message==='source migration SQL failed');
 assert(pg.closed);
});
test('COMMIT error never claims migration success; instructs ledger inspection',async()=>{
 const pg=new Pg({ledger:false,applied:[],commitFail:true});
 await assert.rejects(use(pg),/inspect the checksummed ledger before retry/);
 assert(pg.calls.some(x=>x.sql==='ROLLBACK'));assert(pg.closed);
});
test('BEGIN failure does not claim a transaction or attempt inappropriate rollback',async()=>{
 const pg=new Pg({ledger:false,applied:[],beginFail:true});await assert.rejects(use(pg),/begin error/);
 assert(!pg.calls.some(x=>x.sql==='ROLLBACK'));assert(pg.closed);
});
test('unlock failure blocks success while still closing the connection',async()=>{
 const pg=new Pg({unlockFail:true});await assert.rejects(use(pg,{check:true}),/unlock failed/);
 assert(pg.closed);
});
test('an original failed check is not replaced by later unlock failure',async()=>{
 const pg=new Pg({unlockFail:true,applied:[]});await assert.rejects(use(pg,{check:true}),/pending migrations/);
 assert(pg.closed);
});
test('socket close failure cannot be reported as a successful run',async()=>{
 const pg=new Pg({endFail:true});await assert.rejects(use(pg,{check:true}),/did not close cleanly/);assert(pg.closed);
});
test('an original ledger error takes priority over a secondary close failure',async()=>{
 const pg=new Pg({endFail:true,applied:[]});await assert.rejects(use(pg,{check:true}),/pending migrations/);
});
test('baseline and check cannot be combined',async()=>{
 let called=false;await assert.rejects(run({clientFactory:()=>{called=true;return new Pg()},baseline:true,check:true}),/Cannot baseline and check/);
 assert(!called);
});
test('without credentials and factory the migration runner rejects',async()=>{
 await assert.rejects(run({connectionString:'',clientFactory:undefined}),/DATABASE_URL is required/);
});
test('new CLI plan is available offline without a DB URL or installed pg',()=>{
 const p=spawnSync(process.execPath,['tools/e2e-pg-migration-lock-v78.mjs','--plan'],{cwd:ROOT,env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(p.status,0);const result=JSON.parse(p.stdout);assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.productionApproved,false);
});
test('new live PG tool refuses unsafe/unconfirmed execution before importing pg',()=>{
 const p=spawnSync(process.execPath,['tools/e2e-pg-migration-lock-v78.mjs','--run'],{cwd:ROOT,env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(p.status,1);assert.match(p.stderr,/DISPOSABLE_CONFIRMATION_REQUIRED/);
});
