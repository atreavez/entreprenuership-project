/** Real concurrency contract for v0.45. Only a disposable LOOPBACK PostgreSQL *_test / *_ci database.
 * It intentionally commits random non-user counters across 2 connections, and removes them in finally. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Refuse unsafe target BEFORE importing PG or connecting.
const {default:pg}=await import('pg');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:15000,lock_timeout:5000,application_name:'assettrust-v45-disposable-login-contract'});
const identityHash=randomBytes(32).toString('hex');
const serviceSource=readFileSync(new URL('../apps/api/src/contexts/identity/infrastructure/login-abuse.service.ts',import.meta.url),'utf8');
const queries=[...serviceSource.matchAll(/this\.db\.query\(`(INSERT INTO auth_login_abuse_windows[\s\S]*?)`,\[key\]\)/g)];
assert.equal(queries.length,1,'Expected exactly one application login reservation SQL statement');
const reserve=queries[0][1];
assert(!reserve.includes('${'),'Reservation SQL must not contain template interpolation');
const another=randomBytes(32).toString('hex');
const expired=randomBytes(32).toString('hex');
const fixtures=[identityHash,another,expired];
let checks=0;
try{
 const ledger=await pool.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='020_distributed_login_abuse.sql'");
 assert.equal(ledger.rowCount,1,'run migration 020 first');checks++;
 // Test concurrent reservations from independent DB connections: cannot exceed 10 permitted.
 const completed=await Promise.allSettled(Array.from({length:24},()=>pool.query(reserve,[identityHash])));
 for(const result of completed)if(result.status==='rejected')throw result.reason;
 const counts=completed.map(r=>Number(r.value.rows[0].attempt_count));
 assert.deepEqual(counts.filter(n=>n<=10).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10]);checks++;
 assert.equal(Math.min(...counts),1);assert.equal(Math.max(...counts),11);
 assert.equal(counts.filter(n=>n<=10).length,10);checks++;
 assert.equal((await pool.query('SELECT attempt_count FROM auth_login_abuse_windows WHERE identity_hash=$1',[identityHash])).rows[0].attempt_count,11);checks++;
 const locked=await pool.query('SELECT blocked_until>now() AS blocked,blocked_until::text AS deadline FROM auth_login_abuse_windows WHERE identity_hash=$1',[identityHash]);
 assert.equal(locked.rows[0].blocked,true);checks++;
 // Further attempts must remain blocked without extending the original deadline.
 const blockedAgain=await pool.query(reserve,[identityHash]);
 assert.equal(blockedAgain.rows[0].attempt_count,11);checks++;
 const deadline=await pool.query('SELECT blocked_until::text AS deadline FROM auth_login_abuse_windows WHERE identity_hash=$1',[identityHash]);
 assert.equal(deadline.rows[0].deadline,locked.rows[0].deadline);checks++;
 await pool.query(reserve,[another]);
 assert.equal((await pool.query('SELECT attempt_count FROM auth_login_abuse_windows WHERE identity_hash=$1',[another])).rows[0].attempt_count,1);checks++;
 // An expired window and block must reset on the next reservation.
 await pool.query("INSERT INTO auth_login_abuse_windows(identity_hash,attempt_count,window_started_at,last_attempt_at,blocked_until) VALUES($1,11,now()-interval '40 minutes',now()-interval '20 minutes',now()-interval '5 minutes')",[expired]);
 const reset=await pool.query(reserve,[expired]);
 assert.equal(reset.rows[0].attempt_count,1);assert.equal(reset.rows[0].blocked_until,null);checks+=2;
 const fresh=await pool.query("SELECT window_started_at>=now()-interval '1 minute' AS fresh FROM auth_login_abuse_windows WHERE identity_hash=$1",[expired]);
 assert.equal(fresh.rows[0].fresh,true);checks++;
 }finally{
 try{
  await pool.query('DELETE FROM auth_login_abuse_windows WHERE identity_hash=ANY($1::char(64)[])',[fixtures]);
  const remaining=await pool.query('SELECT count(*)::int AS n FROM auth_login_abuse_windows WHERE identity_hash=ANY($1::char(64)[])',[fixtures]);
  assert.equal(remaining.rows[0].n,0,'Disposable login fixtures must be removed');
 }finally{await pool.end();}
}
console.log(`PASS ${checks} PostgreSQL login throttle contract checks with concurrent connections in ${target.databaseName}; synthetic counters removed; no user records accessed.`);
