/**
 * v0.41: two independent PostgreSQL sessions exercising the EXACT 018 migration
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
const attemptsSql=`INSERT INTO report_share_access_windows
 (share_id,organization_id,window_started_at,failed_count,last_failed_at) VALUES($1,$2,now(),1,now())
 ON CONFLICT (share_id) DO UPDATE SET
  window_started_at=CASE WHEN report_share_access_windows.window_started_at<=now()-interval '15 minutes'
   THEN now() ELSE report_share_access_windows.window_started_at END,
  failed_count=CASE WHEN report_share_access_windows.window_started_at<=now()-interval '15 minutes'
   THEN 1 ELSE LEAST(10,report_share_access_windows.failed_count+1) END,
  last_failed_at=now()`;
const reportShare=randomUUID(),tenant=randomUUID();
try {
 await owner.connect();
 await owner.query(`CREATE SCHEMA ${schema}`);created=true;
 await owner.query(`SET search_path TO ${schema},pg_catalog`);
 await owner.query(`CREATE TABLE report_recipient_shares (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, UNIQUE(id,organization_id))`);
 // Executes the unmodified v0.40 SQL in the temporary schema.
 await owner.query(migration);
 await owner.query('INSERT INTO report_recipient_shares(id,organization_id) VALUES($1,$2)',[reportShare,tenant]);
 await Promise.all([first.connect(),second.connect()]);
 for(const c of [first,second])await c.query(`SET search_path TO ${schema},pg_catalog`);
 // Two distinct DB sessions continuously contend over the same counter row.
 await Promise.all(Array.from({length:10},(_,n)=>(n%2?first:second).query(attemptsSql,[reportShare,tenant])));
 const a=await first.query('SELECT failed_count FROM report_share_access_windows WHERE share_id=$1',[reportShare]);
 const b=await second.query('SELECT failed_count FROM report_share_access_windows WHERE share_id=$1',[reportShare]);
 assert.equal(a.rows[0]?.failed_count,10);assert.equal(b.rows[0]?.failed_count,10);checks+=2;
 // SQL counter is capped; attempts above cap must fail rather than wrap or evade.
 await assert.rejects(()=>first.query(attemptsSql,[reportShare,tenant]));checks++;
 await assert.rejects(()=>second.query('DELETE FROM report_share_access_windows WHERE share_id=$1',[reportShare]));checks++;
 await assert.rejects(()=>second.query('UPDATE report_share_access_windows SET organization_id=$2 WHERE share_id=$1',[reportShare,randomUUID()]));checks++;
 assert.equal((await first.query('SELECT count(*)::int AS total FROM report_share_access_windows')).rows[0].total,1);checks++;
 console.log(`PASS: ${checks} shared-counter PostgreSQL contract assertions through two independent sessions (${target.databaseName}); temporary schema to be removed`);
}finally{
 // Connections that used this schema must stop before owner drops it.
 await Promise.allSettled([first.end(),second.end()]);
 if(created){try{await owner.query('SET search_path TO pg_catalog');await owner.query(`DROP SCHEMA ${schema} CASCADE`)}catch(e){console.error('CRITICAL: Could not remove disposable test schema; investigate '+schema);process.exitCode=1;}}
 await owner.end().catch(()=>{});
}
