/** Disposable PostgreSQL checks for member lifecycle constraints. No persisted fixture data. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // refuse non-disposable databases before connecting
const {default:pg}=await import('pg');
const {Client}=pg;
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000,application_name:'assettrust-v29-disposable-members'});
const [org,otherOrg,adminA,adminB,member,outsider,proposalId]=Array.from({length:7},()=>randomUUID());
let began=false,checks=0;
try{
 await db.connect();await db.query('BEGIN');began=true;
 await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='010_member_management.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[org,'Disposable Member Org',otherOrg,'Other Disposable Org']);
 for(const [id,role] of [[adminA,'ORG_ADMIN'],[adminB,'ORG_ADMIN'],[member,'CLIENT']]){
  await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,'Disposable member',$3,'NOT_A_LOGIN_HASH',$4)`,[id,org,`${id}@invalid.example`,role]);
 }
 assert.equal((await db.query('SELECT 1 FROM users WHERE id=$1 AND organization_id=$2',[member,otherOrg])).rowCount,0);checks++;
 await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'External member',$3,'NOT_A_LOGIN_HASH','CLIENT')`,[outsider,otherOrg,`${outsider}@invalid.example`]);
 await db.query('SAVEPOINT tenant_mismatch');
 await assert.rejects(()=>db.query(`INSERT INTO member_role_proposals(id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by) VALUES($1,$2,$3,'CLIENT','REVIEWER',$4,$5)`,[randomUUID(),org,outsider,'A cross-tenant change must be rejected.',adminA]));checks++;
 await db.query('ROLLBACK TO SAVEPOINT tenant_mismatch');await db.query('RELEASE SAVEPOINT tenant_mismatch');
 await db.query(`INSERT INTO member_role_proposals(id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by)
  VALUES($1,$2,$3,'CLIENT','REVIEWER',$4,$5)`,[proposalId,org,member,'Changing to an internally supervised review role.',adminA]);
 assert.equal((await db.query('SELECT 1 FROM member_role_proposals WHERE id=$1 AND status=$2',[proposalId,'PENDING'])).rowCount,1);checks++;
 await db.query('SAVEPOINT duplicate_proposal');
 await assert.rejects(()=>db.query(`INSERT INTO member_role_proposals(id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by)
  VALUES($1,$2,$3,'CLIENT','SURVEYOR',$4,$5)`,[randomUUID(),org,member,'Duplicate proposal must be rejected.',adminB]));checks++;
 await db.query('ROLLBACK TO SAVEPOINT duplicate_proposal');await db.query('RELEASE SAVEPOINT duplicate_proposal');
 await db.query('SAVEPOINT privilege_escalation');
 await assert.rejects(()=>db.query(`INSERT INTO member_role_proposals(id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by)
  VALUES($1,$2,$3,'CLIENT','ORG_ADMIN',$4,$5)`,[randomUUID(),org,member,'Normal role path may not grant admin.',adminB]));checks++;
 await db.query('ROLLBACK TO SAVEPOINT privilege_escalation');await db.query('RELEASE SAVEPOINT privilege_escalation');
 await db.query('SAVEPOINT incorrect_decision');
 await assert.rejects(()=>db.query("UPDATE member_role_proposals SET status='APPROVED' WHERE id=$1",[proposalId]));checks++;
 await db.query('ROLLBACK TO SAVEPOINT incorrect_decision');await db.query('RELEASE SAVEPOINT incorrect_decision');
 await db.query("UPDATE member_role_proposals SET status='APPROVED',decided_by=$2,decided_at=now() WHERE id=$1",[proposalId,adminB]);
 assert.equal((await db.query("SELECT 1 FROM member_role_proposals WHERE id=$1 AND status='APPROVED' AND decided_by=$2",[proposalId,adminB])).rowCount,1);checks++;
 await db.query('UPDATE users SET suspended_at=now(),suspended_by=$2,suspension_reason=$3 WHERE id=$1',[member,adminA,'Member account disabled for an independent investigation.']);
 assert.equal((await db.query('SELECT suspended_at IS NOT NULL AS suspended FROM users WHERE id=$1',[member])).rows[0].suspended,true);checks++;
 await db.query('UPDATE users SET suspended_at=NULL,suspended_by=NULL,suspension_reason=NULL WHERE id=$1',[member]);
 assert.equal((await db.query('SELECT suspended_at IS NULL AS active FROM users WHERE id=$1',[member])).rows[0].active,true);checks++;
}finally{
 if(began){try{await db.query('ROLLBACK')}catch{process.exitCode=1;}}
 await db.end().catch(()=>{});
}
console.log(`PASS ${checks} disposable PostgreSQL v0.29 assertions; all fixtures rolled back (${target.databaseName})`);
