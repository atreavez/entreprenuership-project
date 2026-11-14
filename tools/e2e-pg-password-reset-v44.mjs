/** Disposable PostgreSQL contract for v0.44 reset tokens and throttling; always rolls back. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Guard must run before importing pg or connecting.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v44-reset-contract'});
let active=false,checks=0;
const org=randomUUID(),user=randomUUID(),t1=randomUUID(),t2=randomUUID();
async function reject(sql,params=[]){await db.query('SAVEPOINT rejected');await assert.rejects(()=>db.query(sql,params));checks++;await db.query('ROLLBACK TO SAVEPOINT rejected');await db.query('RELEASE SAVEPOINT rejected')}
try{
 await db.connect();await db.query('BEGIN');active=true;
 await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='019_password_reset.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[org,'Disposable reset contract']);
 await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'TEST_ONLY',$3,'TEST_HASH','CLIENT')",[user,org,`${user}@invalid.example`]);
 const insert='INSERT INTO auth_password_reset_requests(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval \'15 minutes\')';
 await db.query(insert,[t1,user,'a'.repeat(64)]);checks++;
 await reject(insert,[t2,user,'b'.repeat(64)]); // Unique active token invariant.
 await reject("INSERT INTO auth_password_reset_requests(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '16 minutes')",[t2,user,'b'.repeat(64)]);
 await reject("UPDATE auth_password_reset_requests SET delivery_state='SENT',consumed_at=now() WHERE id=$1",[t1]);
 await db.query("UPDATE auth_password_reset_requests SET delivery_state='SENT' WHERE id=$1",[t1]);
 await db.query("UPDATE auth_password_reset_requests SET consumed_at=now() WHERE id=$1",[t1]);checks++;
 await db.query(insert,[t2,user,'b'.repeat(64)]);checks++;
 await db.query("UPDATE auth_password_reset_requests SET revoked_at=now(),delivery_state='FAILED' WHERE id=$1",[t2]);checks++;
 await reject("UPDATE auth_password_reset_requests SET consumed_at=now() WHERE id=$1",[t2]);
 const lookup='f'.repeat(64);
 await db.query('INSERT INTO auth_password_reset_windows(email_lookup_hash,request_count) VALUES($1,1)',[lookup]);checks++;
 await reject('UPDATE auth_password_reset_windows SET request_count=5 WHERE email_lookup_hash=$1',[lookup]);
 await reject('INSERT INTO auth_password_reset_windows(email_lookup_hash,request_count) VALUES($1,0)',['e'.repeat(64)]);
 const records=await db.query('SELECT token_hash,delivery_state FROM auth_password_reset_requests WHERE user_id=$1',[user]);
 assert.equal(records.rows.length,2);checks++;
 assert(records.rows.every(r=>/^[a-f0-9]{64}$/.test(r.token_hash)));checks++;
 console.log(`PASS ${checks} disposable PostgreSQL reset contract checks; transaction rolled back (${target.databaseName}).`);
}finally{if(active){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}await db.end().catch(()=>{})}
