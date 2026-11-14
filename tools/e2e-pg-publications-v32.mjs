/** Disposable Postgres-only publication contract; changes always rolled back. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Validate BEFORE opening any connection.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v32-disposable-publications'});
let tx=false,checks=0;
const orgA=randomUUID(),orgB=randomUUID(),adminA=randomUUID(),adminB=randomUUID(),proposal=randomUUID();
try{
 await db.connect();await db.query('BEGIN');tx=true;
 await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='3s'");
 assert.equal((await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='012_content_templates.sql'")).rowCount,1);checks++;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[orgA,'Disposable A',orgB,'Disposable B']);
 for(const [id,org] of [[adminA,orgA],[adminB,orgB]])await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable admin',$3,'TEST_NO_LOGIN','ORG_ADMIN')",[id,org,`${id}@invalid.example`]);
 for(const [org,admin,body] of [[orgA,adminA,'Published A for {{case_reference}}'],[orgB,adminB,'Published B for {{case_reference}}']])
  await db.query("INSERT INTO admin_content_templates(scope,scope_id,template_key,body,revision,updated_by,updated_by_org_id) VALUES('organization',$1,'report.summary',$2,1,$3,$1)",[org,body,admin]);
 await db.query("INSERT INTO admin_content_proposals(id,scope,scope_id,template_key,proposed_body,expected_revision,reason,submitted_by,submitted_org_id) VALUES($1,'organization',$2,'report.summary','PENDING not published',1,'Test pending publication isolation',$3,$2)",[proposal,orgA,adminA]);
 const a=await db.query("SELECT body,revision FROM admin_content_templates WHERE scope='organization' AND scope_id=$1 AND template_key='report.summary'",[orgA]);
 assert.equal(a.rows[0].body,'Published A for {{case_reference}}');checks++;
 const b=await db.query("SELECT body,revision FROM admin_content_templates WHERE scope='organization' AND scope_id=$1 AND template_key='report.summary'",[orgB]);
 assert.equal(b.rows[0].body,'Published B for {{case_reference}}');checks++;
 await db.query("INSERT INTO admin_content_templates(scope,scope_id,template_key,body,revision,updated_by,updated_by_org_id) VALUES('platform','00000000-0000-0000-0000-000000000000','website.hero_title','Private platform test title',1,$1,$2)",[adminA,orgA]);
 const global=await db.query("SELECT body FROM admin_content_templates WHERE scope='platform' AND scope_id='00000000-0000-0000-0000-000000000000' AND template_key='website.hero_title'");
 assert.equal(global.rows[0].body,'Private platform test title');checks++;
 const privateCopy=await db.query("SELECT body FROM admin_content_templates WHERE scope='platform' AND scope_id='00000000-0000-0000-0000-000000000000' AND template_key='report.summary'");
 assert.equal(privateCopy.rowCount,0);checks++;
}finally{if(tx){try{await db.query('ROLLBACK')}catch{process.exitCode=1}}await db.end().catch(()=>{})}
console.log(`PASS ${checks} disposable PostgreSQL publication assertions; rolled back (${target.databaseName})`);
