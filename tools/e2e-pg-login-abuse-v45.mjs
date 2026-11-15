/** Real concurrency contract for v0.45. Only a disposable LOOPBACK PostgreSQL *_test / *_ci database.
 * It intentionally commits random non-user counters across 2 connections, and removes them in finally. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Refuse unsafe target BEFORE importing PG or connecting.
const {default:pg}=await import('pg');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,application_name:'assettrust-v45-disposable-login-contract'});
const identityHash=randomBytes(32).toString('hex');
const reserve=`INSERT INTO auth_login_abuse_windows(identity_hash,attempt_count,window_started_at,last_attempt_at)
 VALUES($1,1,now(),now()) ON CONFLICT(identity_hash) DO UPDATE SET
 attempt_count=CASE WHEN auth_login_abuse_windows.blocked_until>now() THEN 11
  WHEN auth_login_abuse_windows.window_started_at<=now()-interval '15 minutes'
  THEN 1 ELSE LEAST(11,auth_login_abuse_windows.attempt_count+1) END,
 blocked_until=CASE WHEN auth_login_abuse_windows.blocked_until>now() THEN auth_login_abuse_windows.blocked_until
  WHEN auth_login_abuse_windows.window_started_at<=now()-interval '15 minutes' THEN NULL
  WHEN auth_login_abuse_windows.attempt_count>=10 THEN now()+interval '15 minutes' ELSE NULL END,
 window_started_at=CASE WHEN auth_login_abuse_windows.blocked_until>now() THEN auth_login_abuse_windows.window_started_at
  WHEN auth_login_abuse_windows.window_started_at<=now()-interval '15 minutes' THEN now()
  ELSE auth_login_abuse_windows.window_started_at END,last_attempt_at=now()
 RETURNING attempt_count,blocked_until,now() AS checked_at`;
let checks=0;
try{
 const ledger=await pool.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='020_distributed_login_abuse.sql'");
 assert.equal(ledger.rowCount,1,'run migration 020 first');checks++;
 // Test concurrent reservations from independent DB connections: cannot exceed 10 permitted.
 const completed=await Promise.all(Array.from({length:24},()=>pool.query(reserve,[identityHash])));
 const counts=completed.map(r=>Number(r.rows[0].attempt_count));
 assert.equal(Math.min(...counts),1);assert.equal(Math.max(...counts),11);
 assert.equal(counts.filter(n=>n<=10).length,10);checks++;
 assert.equal((await pool.query('SELECT attempt_count FROM auth_login_abuse_windows WHERE identity_hash=$1',[identityHash])).rows[0].attempt_count,11);checks++;
 const locked=await pool.query('SELECT blocked_until>now() AS blocked FROM auth_login_abuse_windows WHERE identity_hash=$1',[identityHash]);
 assert.equal(locked.rows[0].blocked,true);checks++;
 const another=randomBytes(32).toString('hex');
 await pool.query(reserve,[another]);
 assert.equal((await pool.query('SELECT attempt_count FROM auth_login_abuse_windows WHERE identity_hash=$1',[another])).rows[0].attempt_count,1);checks++;
 await pool.query('DELETE FROM auth_login_abuse_windows WHERE identity_hash=$1',[another]);
 console.log(`PASS ${checks} PostgreSQL login throttle contract checks with concurrent connections in ${target.databaseName}; no user records accessed.`);
}finally{
 try{await pool.query('DELETE FROM auth_login_abuse_windows WHERE identity_hash=$1',[identityHash])}catch{process.exitCode=1}
 await pool.end();
}
