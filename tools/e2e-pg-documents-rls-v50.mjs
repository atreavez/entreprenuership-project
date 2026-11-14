/**
 * AssetTrust v0.50: disposable PostgreSQL-only document metadata RLS contract.
 * Refuses unapproved/remote/production database targets before requiring pg.
 * Requires migration 025 and a DB operator capable of creating a temporary role.
 * Test fixtures and role are created in a transaction and always rolled back.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env);
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v50-documents-rls-disposable'});
const orgs=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()],assets=[randomUUID(),randomUUID()],cases=[randomUUID(),randomUUID()],documents=[randomUUID(),randomUUID()];
const role='assettrust_v50_ci_'+randomBytes(6).toString('hex');
let began=false,checks=0;
await db.connect();
try{
 const migrated=await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='025_documents_rls.sql'");
 assert.equal(migrated.rowCount,1,'migration 025 must be applied');checks++;
 const flag=await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.documents'::regclass");
 assert.equal(flag.rowCount,1);assert(flag.rows[0].relrowsecurity&&flag.rows[0].relforcerowsecurity,'documents must FORCE RLS');checks++;
 const policies=await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='documents'");
 assert(policies.rows.some(p=>p.policyname==='documents_tenant_v50'&&p.qual?.includes('assettrust.tenant_id')&&p.with_check?.includes('assettrust.tenant_id')),'strict tenant policy required');checks++;
 await db.query('BEGIN');began=true;
 for(let i=0;i<2;i++){
  await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[orgs[i],`v50 synthetic org ${i}`]);
  await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,'Synthetic CI user',$3,'not-a-real-password','ORG_ADMIN')`,[users[i],orgs[i],`assettrust-v50-${randomUUID()}@example.invalid`]);
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[i]]);
  await db.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
   VALUES($1,$2,$3,'LAND','disposable','synthetic',$4)`,[assets[i],orgs[i],`SYN-${assets[i]}`,users[i]]);
  await db.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by)
   VALUES($1,$2,$3,$4,$5)`,[cases[i],orgs[i],`SYN-${cases[i]}`,assets[i],users[i]]);
  await db.query(`INSERT INTO documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format,encryption_key_id)
   VALUES($1,$2,$3,$4,'Synthetic metadata',$5,'application/pdf',0,$6,$7,'AES_256_GCM_V1','ci-test-key')`,
   [documents[i],orgs[i],assets[i],cases[i],`ci-${randomUUID()}.bin`,'0'.repeat(64),users[i]]);
 }
 await db.query("SELECT set_config('assettrust.tenant_id','',true)");
 await db.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
 await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.documents TO ${role}`);
 await db.query(`SET LOCAL ROLE ${role}`);
 const who=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 assert(!who.rolsuper&&!who.rolbypassrls,'the test must execute with a non-bypass role');checks++;
 const count=async()=>Number((await db.query('SELECT count(*)::int n FROM public.documents')).rows[0].n);
 assert.equal(await count(),0,'no tenant scope must deny reads');checks++;
 for(let i=0;i<2;i++){
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[i]]);
  assert.equal(await count(),1,'own tenant document should be visible');checks++;
  assert.equal((await db.query('SELECT count(*)::int n FROM documents WHERE organization_id=$1',[orgs[1-i]])).rows[0].n,0,'cross-tenant reads denied');checks++;
  assert.equal((await db.query("UPDATE documents SET review_status='REJECTED' WHERE id=$1 RETURNING id",[documents[1-i]])).rowCount,0,'cross-tenant update denied');checks++;
  assert.equal((await db.query('DELETE FROM documents WHERE id=$1 RETURNING id',[documents[1-i]])).rowCount,0,'cross-tenant delete denied');checks++;
 }
 await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[0]]);
 await db.query('SAVEPOINT forbidden');
 await assert.rejects(()=>db.query(`INSERT INTO documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format)
  VALUES($1,$2,$3,$4,'Cross-org','cross-org-ci.pdf','application/pdf',0,$5,$6,'AES_256_GCM_V1')`,
  [randomUUID(),orgs[1],assets[1],cases[1],'0'.repeat(64),users[1]]),e=>e.code==='42501','WITH CHECK must reject cross-tenant inserts');checks++;
 await db.query('ROLLBACK TO SAVEPOINT forbidden');
 await db.query("SELECT set_config('assettrust.tenant_id','',true)");
 assert.equal(await count(),0,'clearing tenant scope must deny again');checks++;
 console.log(`PASS ${checks} document RLS assertions on disposable ${target.databaseName}; all fixtures and role rolled back`);
}finally{
 if(began)try{await db.query('ROLLBACK');}catch(e){console.error('ROLLBACK failure',e);process.exitCode=1}
 await db.end();
}
