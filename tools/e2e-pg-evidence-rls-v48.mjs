/**
 * v0.48 live contract: RLS for one core private table. No claims of database-wide RLS.
 * Run ONLY on an explicitly authorized disposable PostgreSQL test DB.
 * All synthetic records, grants and ephemeral role are rolled back.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // deliberately before importing pg
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v48-evidence-rls-disposable'});
const orgs=[randomUUID(),randomUUID()], users=[randomUUID(),randomUUID()], assets=[randomUUID(),randomUUID()], cases=[randomUUID(),randomUUID()], evidence=[randomUUID(),randomUUID()];
const role='assettrust_v48_ci_'+randomBytes(6).toString('hex');
let started=false,checks=0;
await db.connect();
try{
 const ledger=await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='023_case_evidence_rls.sql'");
 assert.equal(ledger.rowCount,1,'migration 023 must be applied before test');checks++;
 const {rows:flags}=await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.case_evidence'::regclass");
 assert.equal(flags.length,1);assert(flags[0].relrowsecurity&&flags[0].relforcerowsecurity);checks++;
 const {rows:policies}=await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='case_evidence'");
 assert(policies.some(x=>x.policyname==='case_evidence_tenant_v48' && x.qual?.includes('assettrust.tenant_id')&&x.with_check?.includes('assettrust.tenant_id')));checks++;
 await db.query('BEGIN');started=true;
 for(let i=0;i<2;i++){
  await db.query('INSERT INTO organizations(id,name) VALUES ($1,$2)',[orgs[i],`synthetic-v48-org-${i}`]);
  await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,'v48 test user',$3,'inert-test-password','ORG_ADMIN')`,[users[i],orgs[i],`v48-${randomUUID()}@example.invalid`]);
  await db.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
   VALUES($1,$2,$3,'LAND','test district','synthetic',$4)`,[assets[i],orgs[i],`SYN-${assets[i]}`,users[i]]);
  await db.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by)
   VALUES($1,$2,$3,$4,$5)`,[cases[i],orgs[i],`SYN-${cases[i]}`,assets[i],users[i]]);
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[i]]);
  await db.query(`INSERT INTO case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,observations,recorded_by)
   VALUES($1,$2,$3,'INTAKE','OTHER','synthetic only','no actual evidence',$4)`,[evidence[i],orgs[i],cases[i],users[i]]);
 }
 await db.query("SELECT set_config('assettrust.tenant_id','',true)");
 await db.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
 await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.case_evidence TO ${role}`);
 await db.query(`SET LOCAL ROLE ${role}`);
 const current=await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
 assert.equal(current.rows[0].rolsuper,false);assert.equal(current.rows[0].rolbypassrls,false);checks++;
 const count=async()=>Number((await db.query('SELECT count(*)::int AS n FROM case_evidence')).rows[0].n);
 assert.equal(await count(),0,'without scope no evidence can be read');checks++;
 for(let i=0;i<2;i++){
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[i]]);
  assert.equal(await count(),1,'tenant should see exactly its own evidence');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM case_evidence WHERE organization_id=$1',[orgs[1-i]])).rows[0].n,0,'cross-tenant read blocked');
  assert.equal((await db.query('UPDATE case_evidence SET observations=$1 WHERE id=$2 RETURNING id',[`unauthorized edit ${i}`,evidence[1-i]])).rowCount,0,'cross-tenant update must affect no rows');
  checks++;
 }
 await db.query('SAVEPOINT forbidden');
 await assert.rejects(()=>db.query(`INSERT INTO case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,observations,recorded_by)
  VALUES($1,$2,$3,'INTAKE','OTHER','synthetic','cross-tenant forgery',$4)`,[randomUUID(),orgs[0],cases[0],users[0]]),e=>e.code==='42501');checks++;
 await db.query('ROLLBACK TO SAVEPOINT forbidden');
 await db.query("SELECT set_config('assettrust.tenant_id','',true)");
 assert.equal(await count(),0,'clear scope returns to deny-all');checks++;
 console.log(`PASS ${checks} real PostgreSQL evidence-RLS assertions on disposable ${target.databaseName}; all fixtures rolled back`);
} finally {
 if(started)try{await db.query('ROLLBACK')}catch(e){console.error('Rollback failed',e);process.exitCode=1}
 await db.end();
}
