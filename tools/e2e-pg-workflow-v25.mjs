/**
 * Live PostgreSQL, rollback-only authorization test. No production/remote DBs.
 * Requires built NestJS API (compiled infrastructure adapters), node pg,
 * migrations applied to a disposable local database and explicit test opt-in.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // before connect or imports with side effects
const {default:pg}=await import('pg');
const {Client}=pg;
const here=dirname(fileURLToPath(import.meta.url));
const {loadCurrentWorkflowActor}=require(resolve(here,'../apps/api/dist/contexts/verification/infrastructure/current-workflow-authorizer.js'));
const {requireCurrentCaseAssignment}=require(resolve(here,'../apps/api/dist/contexts/verification/infrastructure/current-case-assignment.js'));
const ids=Object.fromEntries(['org','admin','lawyer','surveyor','asset','case','appLawyer','appSurveyor'].map(key=>[key,randomUUID()]));
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
const admin={id:ids.admin,organizationId:ids.org,role:'ORG_ADMIN',professionalApproved:false};
const lawyer={id:ids.lawyer,organizationId:ids.org,role:'LEGAL_REVIEWER',professionalApproved:true};
const deny=async(fn)=>assert.rejects(fn, e=>['ForbiddenException','NotFoundException','ConflictException'].includes(e?.name));
let started=false,checks=0;
try{
 await client.connect();await client.query('BEGIN');started=true;
 await client.query("SET LOCAL statement_timeout='10s'");
 await client.query("SET LOCAL lock_timeout='3s'");
 await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[ids.org,'V25 disposable rollback-only org']);
 for(const [key,role] of [['admin','ORG_ADMIN'],['lawyer','LEGAL_REVIEWER'],['surveyor','SURVEYOR']]){
  await client.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
    VALUES($1,$2,'Disposable test actor',$3,'invalid-test-only-hash',$4)`,[ids[key],ids.org,`v25-${ids[key]}@invalid.example`,role]);
 }
 await client.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
  VALUES($1,$2,$3,'LAND','Kampala','Unverified claim',$4)`,[ids.asset,ids.org,`V25-${ids.asset}`,ids.admin]);
 await client.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,assigned_to,stage)
  VALUES($1,$2,$3,$4,$5,$6,'FIELD_INSPECTION')`,[ids.case,ids.org,`V25-${ids.case}`,ids.asset,ids.admin,ids.surveyor]);
 // A cached professionalApproved=true cannot be authoritative.
 assert.equal((await loadCurrentWorkflowActor(client,lawyer,'LEGAL_REVIEW')).professionalApproved,false);checks++;
 await client.query(`INSERT INTO professional_applications(id,applicant_id,organization_id,professional_role,regulator_name,licence_reference,licence_expires_at,explanation)
   VALUES($1,$2,$3,'LEGAL_REVIEWER','Test regulator','DISPOSABLE-V25',now()+interval '1 year','Disposable integration test')`,[ids.appLawyer,ids.lawyer,ids.org]);
 await client.query(`INSERT INTO professional_accreditations(user_id,application_id,professional_role,expires_at)
   VALUES($1,$2,'LEGAL_REVIEWER',now()+interval '1 year')`,[ids.lawyer,ids.appLawyer]);
 assert.equal((await loadCurrentWorkflowActor(client,lawyer,'LEGAL_REVIEW')).professionalApproved,true);checks++;
 await client.query('UPDATE professional_accreditations SET revoked_at=now() WHERE user_id=$1',[ids.lawyer]);
 assert.equal((await loadCurrentWorkflowActor(client,lawyer,'LEGAL_REVIEW')).professionalApproved,false);checks++;
 await client.query("UPDATE professional_accreditations SET revoked_at=NULL,expires_at=now()-interval '5 minutes' WHERE user_id=$1",[ids.lawyer]);
 assert.equal((await loadCurrentWorkflowActor(client,lawyer,'LEGAL_REVIEW')).professionalApproved,false);checks++;
 await client.query("UPDATE professional_accreditations SET expires_at=now()+interval '1 year' WHERE user_id=$1",[ids.lawyer]);
 await client.query("UPDATE users SET role='CLIENT' WHERE id=$1",[ids.lawyer]);
 assert.equal((await loadCurrentWorkflowActor(client,lawyer,'LEGAL_REVIEW')).role,'CLIENT');checks++;
 await client.query("UPDATE users SET role='LEGAL_REVIEWER' WHERE id=$1",[ids.lawyer]);
 await deny(()=>requireCurrentCaseAssignment(client,admin,ids.case,ids.surveyor));checks++;
 await client.query(`INSERT INTO professional_applications(id,applicant_id,organization_id,professional_role,regulator_name,licence_reference,licence_expires_at,explanation)
   VALUES($1,$2,$3,'SURVEYOR','Test regulator','DISPOSABLE-V25',now()+interval '1 year','Disposable integration test')`,[ids.appSurveyor,ids.surveyor,ids.org]);
 await client.query(`INSERT INTO professional_accreditations(user_id,application_id,professional_role,expires_at)
   VALUES($1,$2,'SURVEYOR',now()+interval '1 year')`,[ids.surveyor,ids.appSurveyor]);
 await requireCurrentCaseAssignment(client,admin,ids.case,ids.surveyor);checks++;
 await client.query("UPDATE users SET role='CLIENT' WHERE id=$1",[ids.admin]);
 await deny(()=>requireCurrentCaseAssignment(client,admin,ids.case,ids.surveyor));checks++;
 await client.query("UPDATE users SET role='ORG_ADMIN' WHERE id=$1",[ids.admin]);
 await client.query('UPDATE professional_accreditations SET revoked_at=now() WHERE user_id=$1',[ids.surveyor]);
 await deny(()=>requireCurrentCaseAssignment(client,admin,ids.case,ids.surveyor));checks++;
 await client.query('UPDATE professional_accreditations SET revoked_at=NULL WHERE user_id=$1',[ids.surveyor]);
 await client.query("UPDATE verification_cases SET status='CLOSED',stage='CLOSED' WHERE id=$1",[ids.case]);
 await deny(()=>requireCurrentCaseAssignment(client,admin,ids.case,ids.surveyor));checks++;
 console.log(`PASS ${checks} real SQL authorization assertions on ${target.databaseName}; all fixtures rolled back`);
}finally{
 if(started)try{await client.query('ROLLBACK')}catch(e){process.exitCode=1;console.error('ROLLBACK FAILED',e.message)}
 await client.end().catch(()=>{});
}
