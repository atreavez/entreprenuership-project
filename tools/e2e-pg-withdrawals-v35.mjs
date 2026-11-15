/** Disposable PostgreSQL-only report withdrawal contract; all fixtures rolled back. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Fail BEFORE connecting.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v35-withdrawal-disposable-contract'});
let active=false,checks=0;
async function reject(sql,params=[]){await db.query('SAVEPOINT expected_failure');await assert.rejects(()=>db.query(sql,params));checks++;await db.query('ROLLBACK TO SAVEPOINT expected_failure');await db.query('RELEASE SAVEPOINT expected_failure')}
const orgA=randomUUID(),orgB=randomUUID(),adminA=randomUUID(),adminB=randomUUID(),outsider=randomUUID(),asset=randomUUID(),caseId=randomUUID(),proposal=randomUUID(),issued=randomUUID(),withdrawalProposal=randomUUID(),withdrawal=randomUUID();
const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:'PRIVATE_NON_OFFICIAL_EVIDENCE_REPORT',legalNotice:'Private, non-official evidence only'};
try{
 await db.connect();await db.query('BEGIN');active=true;
 await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='015_report_withdrawal.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[orgA,'Disposable withdrawals A',orgB,'Disposable withdrawals B']);
 for(const [id,org] of [[adminA,orgA],[adminB,orgA],[outsider,orgB]])await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable administrator',$3,'TEST_ONLY_NO_LOGIN','ORG_ADMIN')",[id,org,id+'@invalid.example']);
 await db.query("INSERT INTO assets(id,organization_id,asset_code,asset_type,district,description,declared_owner,created_by) VALUES($1,$2,$3,'LAND','Kampala','Disposable asset','TEST_ONLY',$4)",[asset,orgA,'AT-TEST-'+asset.slice(0,8),adminA]);
 await db.query("INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,status,stage) VALUES($1,$2,$3,$4,$5,'CLOSED','CLOSED')",[caseId,orgA,'AT-TEST-'+caseId.slice(0,8),asset,adminA]);
 await db.query('INSERT INTO report_issuance_proposals(id,organization_id,case_id,prepared_snapshot,snapshot_sha256,reason,proposed_by) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)',[proposal,orgA,caseId,JSON.stringify(snapshot),'a'.repeat(64),'Disposable independent report issuance',adminA]);
 await db.query('INSERT INTO issued_verification_reports(id,organization_id,case_id,proposal_id,snapshot,snapshot_sha256,issued_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[issued,orgA,caseId,proposal,JSON.stringify(snapshot),'a'.repeat(64),adminB]);
 await db.query("UPDATE report_issuance_proposals SET status='ISSUED',decided_by=$2,decided_at=now(),issued_report_id=$3 WHERE id=$1",[proposal,adminB,issued]);checks++;
 const reason='A serious inconsistency was identified during professional review';
 const insert='INSERT INTO report_withdrawal_proposals(id,organization_id,report_id,reason,proposed_by) VALUES($1,$2,$3,$4,$5)';
 await db.query(insert,[withdrawalProposal,orgA,issued,reason,adminA]);checks++;
 await reject(insert,[randomUUID(),orgB,issued,reason,outsider]);
 await reject(insert,[randomUUID(),orgA,issued,reason,adminB]);
 await reject("UPDATE report_withdrawal_proposals SET status='REJECTED',decided_by=$2,decided_at=now() WHERE id=$1",[withdrawalProposal,adminA]);
 await reject("UPDATE report_withdrawal_proposals SET status='REJECTED',decided_by=$2,decided_at=now() WHERE id=$1",[withdrawalProposal,outsider]);
 await db.query('INSERT INTO issued_report_withdrawals(id,organization_id,report_id,proposal_id,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6)',[withdrawal,orgA,issued,withdrawalProposal,reason,adminB]);
 await db.query("UPDATE report_withdrawal_proposals SET status='APPROVED',decided_by=$2,decided_at=now(),withdrawal_id=$3 WHERE id=$1",[withdrawalProposal,adminB,withdrawal]);checks++;
 await reject('UPDATE issued_report_withdrawals SET reason=$2 WHERE id=$1',[withdrawal,'attempt to erase the original private decision']);
 await reject('DELETE FROM issued_report_withdrawals WHERE id=$1',[withdrawal]);
 await reject("UPDATE report_withdrawal_proposals SET status='REJECTED',withdrawal_id=NULL WHERE id=$1",[withdrawalProposal]);
 await reject('INSERT INTO issued_report_withdrawals(id,organization_id,report_id,proposal_id,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),orgA,issued,withdrawalProposal,reason,adminB]);
 await reject('INSERT INTO issued_report_withdrawals(id,organization_id,report_id,proposal_id,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),orgB,issued,withdrawalProposal,reason,outsider]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM issued_report_withdrawals WHERE report_id=$1',[issued])).rows[0].n,1);checks++;
 assert.equal((await db.query('SELECT count(*)::int AS n FROM issued_verification_reports WHERE id=$1',[issued])).rows[0].n,1);checks++;
 console.log(`PASS ${checks} PostgreSQL withdrawal contract checks; fixture transaction rolls back (${target.databaseName})`);
}finally{if(active){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}await db.end().catch(()=>{})}
