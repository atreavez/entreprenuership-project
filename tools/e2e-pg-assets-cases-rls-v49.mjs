/**
 * v0.49 live RLS contract, disposable PostgreSQL ONLY.
 * Every synthetic fixture and temporary role is rolled back.
 * This test never imports pg until the existing fail-closed target guard authorizes execution.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env);
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v49-core-rls-disposable'});
const orgs=[randomUUID(),randomUUID()], users=[randomUUID(),randomUUID()], assets=[randomUUID(),randomUUID()], cases=[randomUUID(),randomUUID()];
const role='assettrust_v49_ci_'+randomBytes(6).toString('hex');
let began=false,checks=0;
await db.connect();
try{
 const applied=await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='024_assets_and_cases_rls.sql'");
 assert.equal(applied.rowCount,1,'migration 024 must be applied');checks++;
 for(const table of ['assets','verification_cases']){
  const {rows:flags}=await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[`public.${table}`]);
  assert(flags.length===1&&flags[0].relrowsecurity&&flags[0].relforcerowsecurity,`${table} must FORCE RLS`);checks++;
 }
 await db.query('BEGIN');began=true;
 for(let i=0;i<2;i++){
  await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[orgs[i],`v49-disposable-org-${i}`]);
  await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,'Synthetic v49 user',$3,'inert-not-a-real-password','ORG_ADMIN')`,[users[i],orgs[i],`assettrust-${randomUUID()}@example.invalid`]);
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[i]]);
  await db.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
    VALUES($1,$2,$3,'LAND','disposable','synthetic',$4)`,[assets[i],orgs[i],`SYN-${assets[i]}`,users[i]]);
  await db.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by)
    VALUES($1,$2,$3,$4,$5)`,[cases[i],orgs[i],`SYN-${cases[i]}`,assets[i],users[i]]);
 }
 await db.query("SELECT set_config('assettrust.tenant_id','',true)");
 await db.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
 await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.assets,public.verification_cases TO ${role}`);
 await db.query(`SET LOCAL ROLE ${role}`);
 const who=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 assert.equal(who.rolsuper,false);assert.equal(who.rolbypassrls,false);checks++;
 const count=async table=>Number((await db.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n);
 for(const t of ['assets','verification_cases']){assert.equal(await count(t),0,`no tenant scope must deny ${t}`);checks++}
 for(let i=0;i<2;i++){
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[i]]);
  for(const t of ['assets','verification_cases']){
   assert.equal(await count(t),1,`${t} must contain exactly one row for org ${i}`);
   assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${t} WHERE organization_id=$1`,[orgs[1-i]])).rows[0].n,0,`cross-tenant ${t} read`);
   const id=t==='assets'?assets[1-i]:cases[1-i];
   const updated=await db.query(`UPDATE public.${t} SET updated_at=now() WHERE id=$1 RETURNING id`,[id]);
   assert.equal(updated.rowCount,0,`cross-tenant ${t} update must affect zero`);
   checks++;
  }
  const join=await db.query('SELECT c.id FROM verification_cases c JOIN assets a ON a.id=c.asset_id WHERE c.organization_id=$1',[orgs[1-i]]);
  assert.equal(join.rowCount,0,'joined cross-tenant query must not leak cases');checks++;
 }
 await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgs[0]]);
 for(const [table,statement,params] of [
  ['assets',`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by) VALUES($1,$2,$3,'LAND','x','x',$4)`,[randomUUID(),orgs[1],`SYN-${randomUUID()}`,users[1]]],
  ['verification_cases',`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),orgs[1],`SYN-${randomUUID()}`,assets[1],users[1]]]
 ]){
  await db.query('SAVEPOINT forbidden');
  await assert.rejects(()=>db.query(statement,params),e=>e.code==='42501',`${table}: RLS must deny cross-tenant insertion`);
  await db.query('ROLLBACK TO SAVEPOINT forbidden');checks++;
 }
 await db.query("SELECT set_config('assettrust.tenant_id','',true)");
 assert.equal(await count('assets'),0);assert.equal(await count('verification_cases'),0);checks++;
 console.log(`PASS ${checks} PostgreSQL RLS assertions on ${target.databaseName}; all fixtures rolled back`);
}finally{
 if(began)try{await db.query('ROLLBACK')}catch(err){console.error('Unsafe rollback failure',err);process.exitCode=1}
 await db.end();
}
