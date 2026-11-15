/**
 * v0.41: two independent PostgreSQL sessions exercising migrations 018 and 028
 * counter upsert and trigger. Runs ONLY on disposable loopback test/CI databases.
 * Creates its own isolated schema, removes it afterward, and never touches the
 * application's production tenant tables. Not a two-HTTP-server or browser test.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {assertDisposableContractEnvironment,makeSchemaName,quoteControlledSchema}=require('./two-client-policy-v41.cjs');
const target=assertDisposableContractEnvironment(process.env); // must fail before importing PG or any connections
const pg=(await import('pg')).default;
const schema=quoteControlledSchema(makeSchemaName());
const opts={connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:12000,application_name:'assettrust-v41-disposable-two-client-contract'};
const owner=new pg.Client(opts),first=new pg.Client(opts),second=new pg.Client(opts);
let created=false,checks=0;
const migration=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../apps/api/sql/018_recipient_attempt_windows.sql'),'utf8');
// Execute the application's exact upsert rather than maintaining a separate test copy.
const serviceSource=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../apps/api/src/contexts/report-sharing/infrastructure/report-sharing.module.ts'),'utf8');
const upsert=serviceSource.match(/await tx\.query\(`(INSERT INTO report_share_access_windows[\s\S]*?)`,\[p\.id,p\.organization_id\]\)/);
assert.ok(upsert,'Application attempt-counter SQL must be found');
const attemptsSql=upsert[1];
const reportShare=randomUUID(),tenant=randomUUID();
try {
 await owner.connect();
 await owner.query(`CREATE SCHEMA ${schema}`);created=true;
 await owner.query(`SET search_path TO ${schema},pg_catalog`);
 await owner.query(`CREATE TABLE report_recipient_shares (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, UNIQUE(id,organization_id))`);
 // Executes the unmodified v0.40 SQL in the temporary schema.
 await owner.query(migration);
 await owner.query(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../apps/api/sql/028_recipient_attempt_clock.sql'),'utf8'));
 await owner.query('INSERT INTO report_recipient_shares(id,organization_id) VALUES($1,$2)',[reportShare,tenant]);
 await Promise.all([first.connect(),second.connect()]);
 for(const c of [first,second])await c.query(`SET search_path TO ${schema},pg_catalog`);
 // Two distinct DB sessions continuously contend over the same counter row.
 const workers=await Promise.allSettled([first,second].map(async client=>{
  for(let n=0;n<5;n++)await client.query(attemptsSql,[reportShare,tenant]);
 }));
 for(const worker of workers)if(worker.status==='rejected')throw worker.reason;
 const a=await first.query('SELECT failed_count FROM report_share_access_windows WHERE share_id=$1',[reportShare]);
 const b=await second.query('SELECT failed_count FROM report_share_access_windows WHERE share_id=$1',[reportShare]);
 assert.equal(a.rows[0]?.failed_count,10);assert.equal(b.rows[0]?.failed_count,10);checks+=2;
 // An older transaction writes after a newer transaction committed.
 // The original clock guard rejects this ordering because now() is frozen at BEGIN.
 const lateShare=randomUUID();
 await owner.query('INSERT INTO report_recipient_shares(id,organization_id) VALUES($1,$2)',[lateShare,tenant]);
 await first.query('BEGIN');
 try{
  await first.query('SELECT now()');
  await second.query('SELECT pg_sleep(0.02)');
  await second.query(attemptsSql,[lateShare,tenant]);
  const before=await second.query('SELECT last_failed_at::text AS stamp FROM report_share_access_windows WHERE share_id=$1',[lateShare]);
  await first.query(attemptsSql,[lateShare,tenant]);
  await first.query('COMMIT');
  const after=await second.query('SELECT failed_count,last_failed_at >= $2::timestamptz AS monotonic FROM report_share_access_windows WHERE share_id=$1',[lateShare,before.rows[0].stamp]);
  assert.equal(after.rows[0].failed_count,2);assert.equal(after.rows[0].monotonic,true);checks+=2;
 }catch(error){await first.query('ROLLBACK');throw error;}
 for(const expression of ["last_failed_at-interval '1 second'","clock_timestamp()+interval '1 hour'"]){
  await assert.rejects(()=>first.query(`UPDATE report_share_access_windows SET failed_count=failed_count+1,last_failed_at=${expression} WHERE share_id=$1`,[lateShare]),/Invalid failure timestamp/);checks++;
 }
 // Expired windows may reset; active windows may not be reset early.
 await assert.rejects(()=>first.query("UPDATE report_share_access_windows SET failed_count=1,window_started_at=statement_timestamp(),last_failed_at=statement_timestamp() WHERE share_id=$1",[lateShare]),/Access failure counters/);checks++;
 const expiredShare=randomUUID();
 await owner.query('INSERT INTO report_recipient_shares(id,organization_id) VALUES($1,$2)',[expiredShare,tenant]);
 await owner.query("INSERT INTO report_share_access_windows(share_id,organization_id,window_started_at,failed_count,last_failed_at) VALUES($1,$2,statement_timestamp()-interval '16 minutes',10,statement_timestamp()-interval '16 minutes')",[expiredShare,tenant]);
 await first.query(attemptsSql,[expiredShare,tenant]);
 const reset=await first.query("SELECT failed_count,window_started_at > statement_timestamp()-interval '1 minute' AS fresh FROM report_share_access_windows WHERE share_id=$1",[expiredShare]);
 assert.equal(reset.rows[0].failed_count,1);assert.equal(reset.rows[0].fresh,true);checks+=2;
 // SQL counter is capped; attempts above cap must fail rather than wrap or evade.
 await assert.rejects(()=>first.query(attemptsSql,[reportShare,tenant]));checks++;
 await assert.rejects(()=>second.query('DELETE FROM report_share_access_windows WHERE share_id=$1',[reportShare]));checks++;
 await assert.rejects(()=>second.query('UPDATE report_share_access_windows SET organization_id=$2 WHERE share_id=$1',[reportShare,randomUUID()]));checks++;
 assert.equal((await first.query('SELECT count(*)::int AS total FROM report_share_access_windows')).rows[0].total,3);checks++;
 console.log(`PASS: ${checks} shared-counter PostgreSQL contract assertions through two independent sessions (${target.databaseName}); temporary schema to be removed`);
}finally{
 // Connections that used this schema must stop before owner drops it.
 await Promise.allSettled([first.end(),second.end()]);
 if(created){try{await owner.query('SET search_path TO pg_catalog');await owner.query(`DROP SCHEMA ${schema} CASCADE`)}catch(e){console.error('CRITICAL: Could not remove disposable test schema; investigate '+schema);process.exitCode=1;}}
 await owner.end().catch(()=>{});
}
