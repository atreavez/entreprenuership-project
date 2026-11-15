/** Live SQL authorization test. No production databases; fixture rolls back.
 * Requires real compiled app, installed pg/NestJS and a disposable test DB.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env);
const {default:pg}=await import('pg');
const {Client}=pg;
const dir=dirname(fileURLToPath(import.meta.url));
const {requireCurrentEvidenceSubmission}=require(resolve(dir,'../apps/api/dist/contexts/verification/infrastructure/current-evidence-authorizer.js'));
const id={org:randomUUID(),admin:randomUUID(),reviewer:randomUUID(),asset:randomUUID(),case:randomUUID(),app:randomUUID()};
const actor={id:id.reviewer,organizationId:id.org};
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
const deny=async(promise)=>assert.rejects(promise,e=>['ForbiddenException','NotFoundException','ConflictException'].includes(e?.name));
let started=false,checks=0;
try{
 await client.connect();await client.query('BEGIN');started=true;
 await client.query("SET LOCAL statement_timeout='10s'");
 await client.query("SET LOCAL lock_timeout='3s'");
 await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[id.org,'V24 rollback-only case fixture']);
 for(const [user,role] of [[id.admin,'ORG_ADMIN'],[id.reviewer,'REVIEWER']]){
  await client.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
    VALUES($1,$2,'Disposable test actor',$3,'test-hash-not-a-real-credential',$4)`,[user,id.org,`v24-${user}@invalid.example`,role]);
 }
 await client.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
   VALUES($1,$2,$3,'LAND','Kampala','Unverified test claim',$4)`,[id.asset,id.org,`V24-${id.asset}`,id.admin]);
 await client.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,assigned_to)
  VALUES($1,$2,$3,$4,$5,$6)`,[id.case,id.org,`V24-${id.case}`,id.asset,id.admin,id.reviewer]);
 assert.equal((await requireCurrentEvidenceSubmission(client,actor,id.case,'INTAKE')).assetId,id.asset);checks++;
 await client.query('UPDATE verification_cases SET assigned_to=NULL WHERE id=$1',[id.case]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'INTAKE'));checks++;
 await client.query('UPDATE verification_cases SET assigned_to=$1 WHERE id=$2',[id.reviewer,id.case]);
 await client.query("UPDATE users SET role='CLIENT' WHERE id=$1",[id.reviewer]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'INTAKE'));checks++;
 await client.query("UPDATE users SET role='REVIEWER' WHERE id=$1",[id.reviewer]);
 await client.query("UPDATE verification_cases SET stage='DOCUMENT_REVIEW' WHERE id=$1",[id.case]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'INTAKE'));checks++;
 await client.query("UPDATE verification_cases SET stage='FIELD_INSPECTION' WHERE id=$1",[id.case]);
 await client.query("UPDATE users SET role='SURVEYOR' WHERE id=$1",[id.reviewer]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'FIELD_INSPECTION'));checks++;
 await client.query(`INSERT INTO professional_applications(id,applicant_id,organization_id,professional_role,regulator_name,licence_reference,licence_expires_at,explanation)
 VALUES($1,$2,$3,'SURVEYOR','Disposable regulator','V24-TEST',now()+interval '1 year','Disposable integration test')`,[id.app,id.reviewer,id.org]);
 await client.query(`INSERT INTO professional_accreditations(user_id,application_id,professional_role,expires_at)
 VALUES($1,$2,'SURVEYOR',now()+interval '1 year')`,[id.reviewer,id.app]);
 await requireCurrentEvidenceSubmission(client,actor,id.case,'FIELD_INSPECTION');checks++;
 await client.query('UPDATE professional_accreditations SET revoked_at=now() WHERE user_id=$1',[id.reviewer]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'FIELD_INSPECTION'));checks++;
 await client.query('UPDATE professional_accreditations SET revoked_at=NULL,expires_at=now()-interval \'1 minute\' WHERE user_id=$1',[id.reviewer]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'FIELD_INSPECTION'));checks++;
 await client.query('UPDATE professional_accreditations SET expires_at=now()+interval \'1 year\' WHERE user_id=$1',[id.reviewer]);
 await requireCurrentEvidenceSubmission(client,actor,id.case,'FIELD_INSPECTION');checks++;
 await client.query("UPDATE verification_cases SET stage='FINAL_REVIEW' WHERE id=$1",[id.case]);
 await deny(requireCurrentEvidenceSubmission(client,actor,id.case,'FINAL_REVIEW'));checks++;
 await client.query("UPDATE users SET role='ORG_ADMIN' WHERE id=$1",[id.reviewer]);
 await requireCurrentEvidenceSubmission(client,actor,id.case,'FINAL_REVIEW');checks++;
 console.log(`PASS ${checks} live PostgreSQL authorization assertions on ${target.databaseName}; transaction will roll back`);
}finally{
 if(started)try{await client.query('ROLLBACK')}catch(e){process.exitCode=1;console.error('ROLLBACK FAILED',e.message)}
 await client.end().catch(()=>{});
}
