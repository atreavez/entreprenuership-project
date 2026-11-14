/** Postgres-only contract: opt-in localhost disposable DB, all fixtures rolled back. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Must fail BEFORE opening a connection.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v34-disposable-report-contract'});
let active=false,checks=0;
async function reject(sql,params=[]){await db.query('SAVEPOINT expected_failure');await assert.rejects(()=>db.query(sql,params));checks++;await db.query('ROLLBACK TO SAVEPOINT expected_failure');await db.query('RELEASE SAVEPOINT expected_failure');}
const orgA=randomUUID(),orgB=randomUUID(),adminA=randomUUID(),adminB=randomUUID(),outsider=randomUUID(),asset=randomUUID(),caseId=randomUUID(),proposal=randomUUID(),issued=randomUUID();
const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:'PRIVATE_NON_OFFICIAL_EVIDENCE_REPORT',legalNotice:'Private evidence only, not an official land title'};
try{
 await db.connect();await db.query('BEGIN');active=true;
 await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='014_report_issuance.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[orgA,'Disposable reports A',orgB,'Disposable reports B']);
 for(const [id,org] of [[adminA,orgA],[adminB,orgA],[outsider,orgB]]){
  await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable reviewer',$3,'TEST_ONLY_NO_LOGIN','ORG_ADMIN')",[id,org,id+'@invalid.example']);
 }
 await db.query("INSERT INTO assets(id,organization_id,asset_code,asset_type,district,description,declared_owner,created_by) VALUES($1,$2,$3,'LAND','Kampala','Disposable report asset','TEST_ONLY',$4)",[asset,orgA,'AT-TEST-'+asset.slice(0,8),adminA]);
 await db.query("INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,status,stage) VALUES($1,$2,$3,$4,$5,'CLOSED','CLOSED')",[caseId,orgA,'AT-TEST-'+caseId.slice(0,8),asset,adminA]);
 const insertProposal=`INSERT INTO report_issuance_proposals (id,organization_id,case_id,prepared_snapshot,snapshot_sha256,reason,proposed_by) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)`;
 const params=[proposal,orgA,caseId,JSON.stringify(snapshot),'a'.repeat(64),'Disposable independent approval workflow',adminA];
 await db.query(insertProposal,params);checks++;
 await reject(insertProposal,[randomUUID(),orgB,caseId,JSON.stringify(snapshot),'a'.repeat(64),'Cross-tenant approval must fail',outsider]);
 await reject(insertProposal,[randomUUID(),orgA,caseId,JSON.stringify(snapshot),'a'.repeat(64),'Second proposal for same case',adminA]);
 await reject("UPDATE report_issuance_proposals SET status='REJECTED',decided_by=$2,decided_at=now() WHERE id=$1",[proposal,adminA]);
 await reject("UPDATE report_issuance_proposals SET status='REJECTED',decided_by=$2,decided_at=now() WHERE id=$1",[proposal,outsider]);
 await db.query("INSERT INTO issued_verification_reports(id,organization_id,case_id,proposal_id,snapshot,snapshot_sha256,issued_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)",[issued,orgA,caseId,proposal,JSON.stringify(snapshot),'a'.repeat(64),adminB]);checks++;
 await db.query("UPDATE report_issuance_proposals SET status='ISSUED',decided_by=$2,decided_at=now(),issued_report_id=$3 WHERE id=$1",[proposal,adminB,issued]);checks++;
 await reject('UPDATE issued_verification_reports SET snapshot_sha256=$2 WHERE id=$1',[issued,'b'.repeat(64)]);
 await reject('DELETE FROM issued_verification_reports WHERE id=$1',[issued]);
 await reject('INSERT INTO issued_verification_reports(id,organization_id,case_id,proposal_id,snapshot,snapshot_sha256,issued_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[randomUUID(),orgB,caseId,proposal,JSON.stringify(snapshot),'a'.repeat(64),outsider]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM issued_verification_reports WHERE id=$1',[issued])).rows[0].n,1);checks++;
 console.log(`PASS ${checks} PostgreSQL report-issuance contract checks; fixture transaction will roll back (${target.databaseName})`);
}finally{if(active){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}await db.end().catch(()=>{})}
