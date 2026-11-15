/** PostgreSQL-only contract: localhost + disposable DB policy, full rollback. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Fail before connecting to database.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v33-disposable-provider-contract'});
let active=false,checks=0;
try{
 await db.connect();await db.query('BEGIN');active=true;
 await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='3s'");
 const migration=await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='013_notification_provider_staging.sql'");assert.equal(migration.rowCount,1);checks++;
 const a=randomUUID(),b=randomUUID(),adminA=randomUUID(),adminB=randomUUID(),another=randomUUID(),proposal=randomUUID();
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[a,'Disposable provider org A',b,'Disposable provider org B']);
 for(const [id,org] of [[adminA,a],[adminB,a],[another,b]])await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable admin',$3,'TEST_NO_LOGIN','ORG_ADMIN')",[id,org,id+'@invalid.example']);
 const staged=[a,'EMAIL','SMTP_RELAY','STAGED','AssetTrust','vault://assettrust/email-primary',1,adminA];
 await db.query('INSERT INTO admin_notification_routes(organization_id,channel,provider,status,sender_label,credential_ref,version,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',staged);
 assert.equal((await db.query('SELECT status FROM admin_notification_routes WHERE organization_id=$1 AND channel=$2',[a,'EMAIL'])).rows[0].status,'STAGED');checks++;
 assert.equal((await db.query('SELECT 1 FROM admin_notification_routes WHERE organization_id=$1',[b])).rowCount,0);checks++;
 await assert.rejects(()=>db.query('INSERT INTO admin_notification_routes(organization_id,channel,provider,status,sender_label,credential_ref,version,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[b,'EMAIL','SMTP_RELAY','STAGED','AssetTrust','vault://other/email',1,adminA]));checks++;
 await db.query('ROLLBACK');active=false;await db.query('BEGIN');active=true;
 // New transaction because deliberate FK violation aborted the prior transaction.
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[a,'Disposable provider org A',b,'Disposable provider org B']);
 for(const [id,org] of [[adminA,a],[adminB,a],[another,b]])await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable admin',$3,'TEST_NO_LOGIN','ORG_ADMIN')",[id,org,id+'@invalid.example']);
 await db.query('INSERT INTO admin_notification_route_changes(id,organization_id,channel,provider,requested_status,sender_label,credential_ref,expected_version,reason,proposed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[proposal,a,'SMS','HTTPS_RELAY','STAGED','AssetTrust','vault://assettrust/sms-main',0,'Test proposed SMS provider changes',adminA]);
 const pending=await db.query("SELECT status FROM admin_notification_route_changes WHERE id=$1",[proposal]);assert.equal(pending.rows[0].status,'PENDING');checks++;
 await db.query("UPDATE admin_notification_route_changes SET status='APPROVED',decided_by=$1,decided_at=now() WHERE id=$2",[adminB,proposal]);checks++;
 console.log(`PASS ${checks} disposable PostgreSQL provider assertions (${target.databaseName}); all fixtures rollback`);
}finally{if(active){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}await db.end().catch(()=>{})}
