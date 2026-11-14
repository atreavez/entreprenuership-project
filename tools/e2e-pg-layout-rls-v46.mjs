/**
 * Real RLS contract. Must run only on explicitly authorized disposable PostgreSQL
 * *_ci or *_test at loopback. Fixtures and NOLOGIN role are rolled back.
 * This test creates NO customer records; all UUIDs and users are synthetic.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // before PG import or any connection
const {default:pg}=await import('pg');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v46-disposable-layout-rls'});
const tables=['report_pdf_layout_proposals','report_pdf_layout_revisions','report_pdf_layout_active'];
const orgA=randomUUID(),orgB=randomUUID();
const userA=randomUUID(),userB=randomUUID(),approverA=randomUUID(),approverB=randomUUID();
const proposalA=randomUUID(),proposalB=randomUUID();
const name='assettrust_v46_ci_'+randomBytes(6).toString('hex');
const layout=JSON.stringify({headerTitle:'PRIVATE TEST ONLY',footerNote:'NOT AN OFFICIAL TITLE',accentHex:'#17402F'});
let inTransaction=false,checks=0;
await client.connect();
try{
 const ledger=await client.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='021_pdf_layout_rls.sql'");
 assert.equal(ledger.rowCount,1,'apply the v0.46 migration first');checks++;
 const flags=await client.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid = ANY(ARRAY[
  'public.report_pdf_layout_proposals'::regclass,'public.report_pdf_layout_revisions'::regclass,'public.report_pdf_layout_active'::regclass])`);
 assert.equal(flags.rows.length,3);
 assert(flags.rows.every(r=>r.relrowsecurity && r.relforcerowsecurity));checks++;
 await client.query('BEGIN');inTransaction=true;
 await client.query('INSERT INTO organizations(id,name) VALUES ($1,$2),($3,$4)',[orgA,'v46 synthetic A',orgB,'v46 synthetic B']);
 for(const [id,org,kind] of [[userA,orgA,'a'],[approverA,orgA,'a2'],[userB,orgB,'b'],[approverB,orgB,'b2']]){
  await client.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
    VALUES($1,$2,$3,$4,$5,'ORG_ADMIN')`,[id,org,'V46 Disposable Admin',`v46-${randomUUID()}-${kind}@example.invalid`,'test-fixture-unusable']);
 }
 for(const [org,proposal,proposer,decider] of [[orgA,proposalA,userA,approverA],[orgB,proposalB,userB,approverB]]){
  await client.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]); // works with FORCE RLS even as owner
  await client.query(`INSERT INTO report_pdf_layout_proposals
   (id,organization_id,proposed_layout,expected_revision,reason,proposed_by,status,decided_by,decided_at)
   VALUES($1,$2,$3::jsonb,0,'Synthetic approved branding only for RLS contract test',$4,'APPROVED',$5,now())`,
   [proposal,org,layout,proposer,decider]);
  await client.query(`INSERT INTO report_pdf_layout_revisions(organization_id,revision,layout,proposal_id,approved_by)
    VALUES($1,1,$2::jsonb,$3,$4)`,[org,layout,proposal,decider]);
  await client.query('INSERT INTO report_pdf_layout_active(organization_id,revision) VALUES($1,1)',[org]);
 }
 await client.query("SELECT set_config('assettrust.tenant_id','',true)");
 // Switch from fixture-owning role to a real non-owner, NOLOGIN, NOBYPASSRLS test role.
 // Role is created within the same transaction and removed by ROLLBACK.
 await client.query(`CREATE ROLE ${name} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await client.query(`GRANT USAGE ON SCHEMA public TO ${name}`);
 await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE ${tables.map(t=>'public.'+t).join(',')} TO ${name}`);
 await client.query(`SET LOCAL ROLE ${name}`);
 const role=await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
 assert.equal(role.rows[0].rolsuper,false);assert.equal(role.rows[0].rolbypassrls,false);checks++;
 const counts=async()=>Promise.all(tables.map(async t=>Number((await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n)));
 assert.deepEqual(await counts(),[0,0,0],'no tenant context must deny all');checks++;
 for(const [org,other] of [[orgA,orgB],[orgB,orgA]]){
  await client.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);
  assert.deepEqual(await counts(),[1,1,1],`only the scoped ${org} rows must be visible`);
  for(const t of tables){
   const {rows}=await client.query(`SELECT count(*)::int AS n FROM ${t} WHERE organization_id=$1`,[other]);
   assert.equal(rows[0].n,0,`no cross-org rows visible in ${t}`);
  }
  checks++;
 }
 // FOR ALL ... WITH CHECK must prevent cross-organization INSERT even with correct FK references.
 await client.query('SAVEPOINT rls_attack');
 await assert.rejects(()=>client.query(`INSERT INTO report_pdf_layout_proposals
   (id,organization_id,proposed_layout,expected_revision,reason,proposed_by)
   VALUES($1,$2,$3::jsonb,0,'Synthetic rejected cross-tenant mutation test',$4)`,
   [randomUUID(),orgA,layout,userA]),e=>e.code==='42501');checks++;
 await client.query('ROLLBACK TO SAVEPOINT rls_attack');
 const read=await client.query('SELECT organization_id FROM report_pdf_layout_active');
 assert.deepEqual(read.rows.map(r=>r.organization_id),[orgB]);checks++;
 await client.query("SELECT set_config('assettrust.tenant_id','',true)");
 assert.deepEqual(await counts(),[0,0,0]);checks++;
 console.log(`PASS ${checks} PostgreSQL RLS isolation contracts against 3 private tables in ${target.databaseName}; no persistent fixtures or role`);
}finally{
 if(inTransaction)try{await client.query('ROLLBACK')}catch(e){console.error('Rollback failed',e);process.exitCode=1}
 await client.end();
}
