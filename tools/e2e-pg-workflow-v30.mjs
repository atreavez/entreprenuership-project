/** Rollback-only v0.30 SQL checks. Refuses remote, persistent and production databases. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // BEFORE pg import or connection
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000,application_name:'assettrust-v30-disposable-workflow'});
const [org,otherOrg,adminA,adminB,outsider,pendingId]=Array.from({length:6},()=>randomUUID());
let started=false,checks=0;
async function expectConstraint(sql,args=[]){await db.query('SAVEPOINT isolated_check');await assert.rejects(()=>db.query(sql,args));checks++;await db.query('ROLLBACK TO SAVEPOINT isolated_check');await db.query('RELEASE SAVEPOINT isolated_check');}
try{
 await db.connect();await db.query('BEGIN');started=true;
 await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='011_workflow_admin.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[org,'Disposable workflow organization',otherOrg,'Separate disposable organization']);
 for(const [id,organization_id,role] of [[adminA,org,'ORG_ADMIN'],[adminB,org,'ORG_ADMIN'],[outsider,otherOrg,'ORG_ADMIN']]){
  await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable test admin',$3,'TEST_ONLY_NO_LOGIN',$4)",[id,organization_id,`${id}@invalid.example`,role]);
 }
 const insert=`INSERT INTO workflow_stage_policy_changes(id,organization_id,stage,target_days,reminder_days,additional_evidence_type,expected_version,reason,proposed_by)
   VALUES($1,$2,'FIELD_INSPECTION',8,2,'DOCUMENT',0,'Independent field documentation is required.', $3)`;
 await db.query(insert,[pendingId,org,adminA]);
 assert.equal((await db.query("SELECT 1 FROM workflow_stage_policy_changes WHERE id=$1 AND status='PENDING'",[pendingId])).rowCount,1);checks++;
 await expectConstraint(insert,[randomUUID(),org,adminB]); // one pending per stage
 await expectConstraint(insert,[randomUUID(),org,outsider]); // cross-tenant proposer
 await expectConstraint(`INSERT INTO workflow_stage_policies(organization_id,stage,target_days,reminder_days,additional_evidence_type,version,updated_by)
    VALUES($1,'FIELD_INSPECTION',8,3,'FIELD_REPORT',1,$2)`,[org,adminA]); // cannot replace mandatory evidence
 await expectConstraint(`INSERT INTO workflow_stage_policies(organization_id,stage,target_days,reminder_days,additional_evidence_type,version,updated_by)
    VALUES($1,'FIELD_INSPECTION',8,8,'DOCUMENT',1,$2)`,[org,adminA]); // invalid reminder
 await expectConstraint("UPDATE workflow_stage_policy_changes SET status='APPROVED',decided_by=$2,decided_at=now() WHERE id=$1",[pendingId,adminA]); // no self-approval
 await expectConstraint("UPDATE workflow_stage_policy_changes SET status='APPROVED',decided_by=$2,decided_at=now() WHERE id=$1",[pendingId,outsider]); // no cross-org approver
 await db.query("UPDATE workflow_stage_policy_changes SET status='APPROVED',decided_by=$2,decided_at=now() WHERE id=$1",[pendingId,adminB]);
 assert.equal((await db.query("SELECT 1 FROM workflow_stage_policy_changes WHERE id=$1 AND status='APPROVED'",[pendingId])).rowCount,1);checks++;
 await db.query(`INSERT INTO workflow_stage_policies(organization_id,stage,target_days,reminder_days,additional_evidence_type,version,updated_by)
  VALUES($1,'FIELD_INSPECTION',8,2,'DOCUMENT',1,$2)`,[org,adminB]);
 assert.equal((await db.query("SELECT version FROM workflow_stage_policies WHERE organization_id=$1 AND stage='FIELD_INSPECTION'",[org])).rows[0].version,1);checks++;
 assert.equal((await db.query('SELECT 1 FROM workflow_stage_policies WHERE organization_id=$1',[otherOrg])).rowCount,0);checks++;
}finally{
 if(started){try{await db.query('ROLLBACK')}catch{process.exitCode=1;}}
 await db.end().catch(()=>{});
}
console.log(`PASS ${checks} disposable workflow SQL assertions; all fixtures rolled back (${target.databaseName})`);
