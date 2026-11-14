/**
 * V47 live PostgreSQL contract: one transaction, exclusively synthetic records,
 * always rolled back. Must run AFTER migration 022 on an explicitly disposable
 * loopback assettrust_*_test or *_ci DB. NO real customer data.
 * This contract validates FK tenant integrity, NOT tenant RLS read permissions.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // refuses unsafe target BEFORE loading pg.
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v47-disposable-core-tenant-fk'});
const [orgA,orgB,userA,userB,assetA,assetB,caseA,caseB]=Array.from({length:8},()=>randomUUID());
let started=false,checks=0;
const invalidUuid=()=>randomUUID();
await db.connect();
try {
 const ledger=await db.query("SELECT 1 FROM assettrust_schema_migrations WHERE filename='022_core_tenant_relationship_integrity.sql'");
 assert.equal(ledger.rowCount,1,'Migration 022 must be applied before test'); checks++;
 // Database catalog proof: all new FKs must be validated and referenced across 2 columns.
 const catalog=await db.query(`SELECT conname,convalidated,array_length(conkey,1) AS columns
 FROM pg_constraint WHERE conname LIKE 'fk_%_tenant_v47' OR conname='fk_documents_case_asset_consistency_v47' ORDER BY conname`);
 assert.equal(catalog.rows.length,11,'expected all eleven composite FK constraints');
 assert(catalog.rows.every(x=>x.convalidated && x.columns === (x.conname==='fk_documents_case_asset_consistency_v47' ? 3 : 2)));checks++;
 await db.query('BEGIN');started=true;
 await db.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[orgA,'v47 synthetic A',orgB,'v47 synthetic B']);
 for(const [id,org] of [[userA,orgA],[userB,orgB]]){
  await db.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
    VALUES($1,$2,'v47 synthetic user',$3,'inert-password-fixture','ORG_ADMIN')`,[id,org,`v47-${id}@example.invalid`]);
 }
 const addAsset=async (id,org,by)=>db.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,description,declared_owner,created_by)
  VALUES($1,$2,$3,'LAND','synthetic district','not a real asset','synthetic owner',$4)`,[id,org,`SYN-${id}`,by]);
 const addCase=async(id,org,asset,creator,assignee=null)=>db.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,assigned_to)
  VALUES($1,$2,$3,$4,$5,$6)`,[id,org,`SYN-CASE-${id}`,asset,creator,assignee]);
 const addEvidence=async(id,org,caseId,recorder,reviewer=null)=>db.query(`INSERT INTO case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,observations,recorded_by,reviewed_by)
  VALUES($1,$2,$3,'INTAKE','OTHER','synthetic only','test only',$4,$5)`,[id,org,caseId,recorder,reviewer]);
 const addDoc=async(id,org,assetId,caseId,by)=>db.query(`INSERT INTO documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by)
  VALUES($1,$2,$3,$4,'fake test record',$5,'application/pdf',100,$6,$7)`,[id,org,assetId,caseId,`SYN-${id}.pdf`,'0'.repeat(64),by]);
 await addAsset(assetA,orgA,userA);await addAsset(assetB,orgB,userB);
 await addCase(caseA,orgA,assetA,userA,userA);await addCase(caseB,orgB,assetB,userB,userB);
 await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[orgA]);
 await addEvidence(invalidUuid(),orgA,caseA,userA,userA);
 await addDoc(invalidUuid(),orgA,assetA,caseA,userA);
 checks++;
 // All violations must fail with 23503 (FK violation), but keep testing via savepoints.
 const mustDeny=async(label,fn)=>{
  await db.query('SAVEPOINT v47_attack');
  try{await assert.rejects(fn(),e=>e.code==='23503',label);checks++;}
  finally{await db.query('ROLLBACK TO SAVEPOINT v47_attack');await db.query('RELEASE SAVEPOINT v47_attack');}
 };
 await mustDeny('other-tenant asset creator',()=>addAsset(invalidUuid(),orgA,userB));
 await mustDeny('other-tenant case asset',()=>addCase(invalidUuid(),orgA,assetB,userA));
 await mustDeny('other-tenant case creator',()=>addCase(invalidUuid(),orgA,assetA,userB));
 await mustDeny('other-tenant case assignee',()=>addCase(invalidUuid(),orgA,assetA,userA,userB));
 await mustDeny('other-tenant evidence case',()=>addEvidence(invalidUuid(),orgA,caseB,userA));
 await mustDeny('other-tenant evidence recorder',()=>addEvidence(invalidUuid(),orgA,caseA,userB));
 await mustDeny('other-tenant evidence reviewer',()=>addEvidence(invalidUuid(),orgA,caseA,userA,userB));
 await mustDeny('other-tenant document asset',()=>addDoc(invalidUuid(),orgA,assetB,null,userA));
 await mustDeny('other-tenant document case',()=>addDoc(invalidUuid(),orgA,null,caseB,userA));
 await mustDeny('other-tenant document uploader',()=>addDoc(invalidUuid(),orgA,assetA,null,userB));
 // Same-tenant but different case/asset pairing also violates relationship integrity.
 const extraAsset=invalidUuid();await addAsset(extraAsset,orgA,userA);
 await mustDeny('inconsistent same-tenant case and asset',()=>addDoc(invalidUuid(),orgA,extraAsset,caseA,userA));
 // Updates must be blocked too, not only INSERT.
 await mustDeny('other-tenant case assignment update',()=>db.query('UPDATE verification_cases SET assigned_to=$1 WHERE id=$2',[userB,caseA]));
 await mustDeny('other-tenant asset association update',()=>db.query('UPDATE verification_cases SET asset_id=$1 WHERE id=$2',[assetB,caseA]));
 console.log(`PASS ${checks} live core tenant relational integrity assertions on ${target.databaseName}, all fixtures rolled back`);
} finally {
 if(started)try{await db.query('ROLLBACK')}catch(e){console.error('Rollback error',e);process.exitCode=1;}
 await db.end();
}
