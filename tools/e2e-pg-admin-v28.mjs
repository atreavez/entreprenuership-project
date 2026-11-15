/** Disposable PostgreSQL checks for v0.28 admin schema. All fixtures rolled back. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // validate *before* database connection
const {default:pg}=await import('pg');
const {Client}=pg;
const db=new Client({connectionString:process.env.DATABASE_URL,application_name:'assettrust-v28-disposable-admin',connectionTimeoutMillis:4000});
const [org,otherOrg,actor,reviewer,proposalId]=Array.from({length:5},()=>randomUUID());
const global='00000000-0000-0000-0000-000000000000';
let started=false,checks=0;
try{
 await db.connect();await db.query('BEGIN');started=true;
 await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='009_admin_control_plane.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[org,'Disposable Admin Org',otherOrg,'Other Tenant']);
 for(const [id,role] of [[actor,'ORG_ADMIN'],[reviewer,'ORG_ADMIN']])await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable actor',$3,'NOT_A_LOGIN_HASH',$4)`,[id,org,`${id}@invalid.example`,role]);
 await db.query("INSERT INTO platform_admin_appointments(user_id,granted_by,grant_source) VALUES($1,$1,'OPERATOR_BOOTSTRAP')",[actor]);
 assert.equal((await db.query('SELECT 1 FROM platform_admin_appointments WHERE user_id=$1 AND revoked_at IS NULL',[actor])).rowCount,1);checks++;
 await db.query(`INSERT INTO admin_configuration_values(scope,scope_id,setting_key,value,version,updated_by)
 VALUES('organization',$1,'workspace.display_name',$2::jsonb,1,$3)`,[org,JSON.stringify('Tenant display'),actor]);
 assert.equal((await db.query("SELECT value FROM admin_configuration_values WHERE scope='organization' AND scope_id=$1",[org])).rows[0].value,'Tenant display');checks++;
 assert.equal((await db.query("SELECT value FROM admin_configuration_values WHERE scope='organization' AND scope_id=$1",[otherOrg])).rowCount,0);checks++;
 await db.query('SAVEPOINT pg_admin_constraint');
 await assert.rejects(()=>db.query(`INSERT INTO admin_configuration_values(scope,scope_id,setting_key,value,version,updated_by)
 VALUES('platform',$1,'branding.product_name',$2::jsonb,1,$3)`,[org,JSON.stringify('Invalid global id'),actor]));checks++;
 // Savepoint recovery after the intentional SQL constraint failure.
 await db.query('ROLLBACK TO SAVEPOINT pg_admin_constraint');
 await db.query('RELEASE SAVEPOINT pg_admin_constraint');
 await db.query(`INSERT INTO admin_configuration_changes(id,scope,scope_id,setting_key,proposed_value,expected_version,status,submitted_by)
 VALUES($1,'organization',$2,'workflow.review_target_days',$3::jsonb,0,'PENDING',$4)`,[proposalId,org,JSON.stringify(14),actor]);
 assert.equal((await db.query("SELECT 1 FROM admin_configuration_changes WHERE id=$1 AND status='PENDING'",[proposalId])).rowCount,1);checks++;
 await db.query('SAVEPOINT pg_admin_pending');
 await assert.rejects(()=>db.query(`INSERT INTO admin_configuration_changes(id,scope,scope_id,setting_key,proposed_value,expected_version,status,submitted_by)
 VALUES($1,'organization',$2,'workflow.review_target_days',$3::jsonb,0,'PENDING',$4)`,[randomUUID(),org,JSON.stringify(21),reviewer]));checks++;
 await db.query('ROLLBACK TO SAVEPOINT pg_admin_pending');await db.query('RELEASE SAVEPOINT pg_admin_pending');
 await db.query("UPDATE admin_configuration_changes SET status='APPROVED',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[proposalId,reviewer]);
 assert.equal((await db.query("SELECT 1 FROM admin_configuration_changes WHERE id=$1 AND status='APPROVED' AND reviewed_by=$2",[proposalId,reviewer])).rowCount,1);checks++;
}finally{
 if(started){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}
 await db.end().catch(()=>{});
}
console.log(`PASS: ${checks} v0.28 disposable PostgreSQL assertions; all fixtures rolled back (${target.databaseName})`);
