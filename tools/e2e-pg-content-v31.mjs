/** Rollback-only SQL contract test for v0.31; refuses non-disposable/remote databases. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Before importing pg or opening a connection.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:4000,application_name:'assettrust-v31-disposable-content'});
const [org,otherOrg,adminA,adminB,outsider,proposal]=Array.from({length:6},()=>randomUUID());
let started=false,checks=0;
async function reject(sql,args=[]){await db.query('SAVEPOINT invalid_content_case');await assert.rejects(()=>db.query(sql,args));checks++;await db.query('ROLLBACK TO SAVEPOINT invalid_content_case');await db.query('RELEASE SAVEPOINT invalid_content_case');}
try {
 await db.connect();await db.query('BEGIN');started=true;
 await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='012_content_templates.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[org,'Disposable content organization',otherOrg,'Separate content organization']);
 for(const [id,oid] of [[adminA,org],[adminB,org],[outsider,otherOrg]]){
  await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable content admin',$3,'TEST_ONLY_NO_LOGIN','ORG_ADMIN')",[id,oid,`${id}@invalid.example`]);
 }
 const insert=`INSERT INTO admin_content_proposals(id,scope,scope_id,template_key,proposed_body,expected_revision,reason,submitted_by,submitted_org_id)
  VALUES($1,'organization',$2,'report.summary','Reviewed asset {{asset_reference}}',0,'Clarify supporting evidence summary',$3,$4)`;
 await db.query(insert,[proposal,org,adminA,org]);checks++;
 await reject(insert,[randomUUID(),org,adminB,org]); // Partial unique index: one pending per template.
 await reject(insert,[randomUUID(),org,outsider,otherOrg]); // Tenant id cannot differ from submitter's organization.
 await reject(`UPDATE admin_content_proposals SET status='APPROVED',reviewed_by=$2,reviewed_org_id=$3,reviewed_at=now() WHERE id=$1`,[proposal,adminA,org]); // No self-review of report.
 await reject(`UPDATE admin_content_proposals SET status='APPROVED',reviewed_by=$2,reviewed_org_id=$3,reviewed_at=now() WHERE id=$1`,[proposal,outsider,otherOrg]); // Reviewer must belong to same tenant.
 await db.query(`UPDATE admin_content_proposals SET status='APPROVED',reviewed_by=$2,reviewed_org_id=$3,reviewed_at=now() WHERE id=$1`,[proposal,adminB,org]);checks++;
 await db.query(`INSERT INTO admin_content_templates(scope,scope_id,template_key,body,revision,updated_by,updated_by_org_id)
  VALUES('organization',$1,'report.summary','Asset {{asset_reference}} checked.',1,$2,$1)`,[org,adminB]);checks++;
 await reject(`INSERT INTO admin_content_templates(scope,scope_id,template_key,body,revision,updated_by,updated_by_org_id)
  VALUES('organization',$1,'report.reviewer_note','Untrusted',1,$2,$3)`,[org,outsider,otherOrg]); // Tenant scope protects published content.
 await reject(`INSERT INTO admin_content_templates(scope,scope_id,template_key,body,revision,updated_by,updated_by_org_id)
  VALUES('organization',$1,'report.reviewer_note','<script>Bad</script>',1,$2,$1)`,[org,adminA]); // SQL rejects raw markup.
 // Low-risk tagline is explicitly exempt from distinct reviewer constraint for audited direct publishing.
 const tagline=randomUUID();
 await db.query(`INSERT INTO admin_content_proposals(id,scope,scope_id,template_key,proposed_body,expected_revision,reason,status,submitted_by,submitted_org_id,reviewed_by,reviewed_org_id,reviewed_at)
  VALUES($1,'organization',$2,'branding.workspace_tagline','Helpful land services',0,'Improve workspace description','APPROVED',$3,$2,$3,$2,now())`,[tagline,org,adminA]);checks++;
 assert.equal((await db.query('SELECT 1 FROM admin_content_templates WHERE scope_id=$1',[otherOrg])).rowCount,0);checks++;
}finally{if(started){try{await db.query('ROLLBACK')}catch{process.exitCode=1;}}await db.end().catch(()=>{});}
console.log(`PASS ${checks} disposable content SQL assertions; fixtures rolled back (${target.databaseName})`);
