/** v0.40 PostgreSQL recipient-share and failed-attempt contract. Explicit opt-in, loopback, disposable *_test or *_ci DB only.
 * No persistent fixtures: single transaction rolled back even if an assertion fails. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Fail BEFORE database connection.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v40-disposable-attempt-contract'});
let active=false,checks=0;
async function reject(sql,params=[]){await db.query('SAVEPOINT expected_failure');await assert.rejects(()=>db.query(sql,params));checks++;await db.query('ROLLBACK TO SAVEPOINT expected_failure');await db.query('RELEASE SAVEPOINT expected_failure')}
const orgA=randomUUID(),orgB=randomUUID(),adminA=randomUUID(),adminB=randomUUID(),outsider=randomUUID();
const asset=randomUUID(),caseId=randomUUID(),issueProposal=randomUUID(),issued=randomUUID(),share=randomUUID(),redemption=randomUUID();
const snapshot={reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:'PRIVATE_NON_OFFICIAL_EVIDENCE_REPORT',legalNotice:'Not an official land-title certificate'};
const reason='Recipient is permitted limited private review of the issued evidence report';
const insertShare=`INSERT INTO report_recipient_shares
 (id,organization_id,report_id,recipient_label,reason,token_sha256,code_sha256,expires_hours,max_downloads,proposed_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`;
try{
 await db.connect();await db.query('BEGIN');active=true;
 await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='018_recipient_attempt_windows.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[orgA,'Disposable share org A',orgB,'Disposable share org B']);
 for(const [id,org] of [[adminA,orgA],[adminB,orgA],[outsider,orgB]])await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable administrator',$3,'TEST_ONLY_NO_LOGIN','ORG_ADMIN')",[id,org,id+'@invalid.example']);
 await db.query("INSERT INTO assets(id,organization_id,asset_code,asset_type,district,description,declared_owner,created_by) VALUES($1,$2,$3,'LAND','Kampala','Disposable verification','TEST_ONLY',$4)",[asset,orgA,'AT-TEST-'+asset.slice(0,8),adminA]);
 await db.query("INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,status,stage) VALUES($1,$2,$3,$4,$5,'CLOSED','CLOSED')",[caseId,orgA,'AT-TEST-'+caseId.slice(0,8),asset,adminA]);
 await db.query('INSERT INTO report_issuance_proposals(id,organization_id,case_id,prepared_snapshot,snapshot_sha256,reason,proposed_by) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)',[issueProposal,orgA,caseId,JSON.stringify(snapshot),'a'.repeat(64),'Independent disposable report issuance',adminA]);
 await db.query('INSERT INTO issued_verification_reports(id,organization_id,case_id,proposal_id,snapshot,snapshot_sha256,issued_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',[issued,orgA,caseId,issueProposal,JSON.stringify(snapshot),'a'.repeat(64),adminB]);
 await db.query("UPDATE report_issuance_proposals SET status='ISSUED',decided_by=$2,decided_at=now(),issued_report_id=$3 WHERE id=$1",[issueProposal,adminB,issued]);
 const args=[share,orgA,issued,'Disposable recipient',reason,'a'.repeat(64),'b'.repeat(64),24,2,adminA];
 await db.query(insertShare,args);checks++;
 // New v0.40 table must be tenant-bound and bounded. All data is inside the ROLLBACK transaction.
 await db.query('INSERT INTO report_share_access_windows(share_id,organization_id,failed_count) VALUES($1,$2,1)',[share,orgA]);checks++;
 await reject('INSERT INTO report_share_access_windows(share_id,organization_id,failed_count) VALUES($1,$2,1)',[randomUUID(),orgA]);
 await reject('UPDATE report_share_access_windows SET organization_id=$2 WHERE share_id=$1',[share,orgB]);
 await reject('UPDATE report_share_access_windows SET failed_count=0 WHERE share_id=$1',[share]);
 for(let n=2;n<=10;n++)await db.query('UPDATE report_share_access_windows SET failed_count=failed_count+1,last_failed_at=now() WHERE share_id=$1',[share]);
 assert.equal((await db.query('SELECT failed_count FROM report_share_access_windows WHERE share_id=$1',[share])).rows[0].failed_count,10);checks++;
 await reject('UPDATE report_share_access_windows SET failed_count=failed_count+1 WHERE share_id=$1',[share]);
 await reject('DELETE FROM report_share_access_windows WHERE share_id=$1',[share]);

 await reject(insertShare,[randomUUID(),orgB,issued,'Other organization',reason,'a'.repeat(64),'b'.repeat(64),24,2,outsider]);
 await reject("UPDATE report_recipient_shares SET status='ACTIVE',reviewed_by=$2,reviewed_at=now(),expires_at=now()+interval '1 day' WHERE id=$1",[share,adminA]);
 await reject("UPDATE report_recipient_shares SET status='ACTIVE',reviewed_by=$2,reviewed_at=now(),expires_at=now()+interval '1 day' WHERE id=$1",[share,outsider]);
 await db.query("UPDATE report_recipient_shares SET status='ACTIVE',reviewed_by=$2,reviewed_at=now(),expires_at=now()+interval '1 day' WHERE id=$1",[share,adminB]);checks++;
 await reject('UPDATE report_recipient_shares SET token_sha256=$2 WHERE id=$1',[share,'c'.repeat(64)]);
 await reject("UPDATE report_recipient_shares SET status='PENDING' WHERE id=$1",[share]);
 await db.query('UPDATE report_recipient_shares SET download_count=download_count+1 WHERE id=$1',[share]);checks++;
 await db.query('INSERT INTO report_share_redemptions(id,organization_id,share_id,report_id,pdf_sha256,signing_key_id) VALUES($1,$2,$3,$4,$5,$6)',[redemption,orgA,share,issued,'d'.repeat(64),'test-key']);checks++;
 await reject('INSERT INTO report_share_redemptions(id,organization_id,share_id,report_id,pdf_sha256,signing_key_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),orgB,share,issued,'d'.repeat(64),'test-key']);
 await reject('UPDATE report_share_redemptions SET pdf_sha256=$2 WHERE id=$1',[redemption,'e'.repeat(64)]);
 await reject('DELETE FROM report_share_redemptions WHERE id=$1',[redemption]);
 await db.query('UPDATE report_recipient_shares SET download_count=download_count+1 WHERE id=$1',[share]);checks++;
 await reject('UPDATE report_recipient_shares SET download_count=download_count+1 WHERE id=$1',[share]);
 await db.query("UPDATE report_recipient_shares SET status='REVOKED',revoked_by=$2,revoked_at=now(),revocation_reason=$3 WHERE id=$1",[share,adminA,'Recipient evidence access no longer required; revoke immediately']);checks++;
 await reject('UPDATE report_recipient_shares SET download_count=download_count-1 WHERE id=$1',[share]);
 await reject('DELETE FROM report_recipient_shares WHERE id=$1',[share]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM report_share_redemptions WHERE share_id=$1',[share])).rows[0].n,1);checks++;
 console.log(`PASS ${checks} PostgreSQL report sharing and attempt-window contract checks; all disposable fixtures roll back (${target.databaseName})`);
}finally{if(active){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}await db.end().catch(()=>{})}
