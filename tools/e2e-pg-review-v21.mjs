/** Executes the ACTUAL v0.21 review-authorization SQL against disposable Postgres/PostGIS.
 * Requires npm packages plus a MIGRATED, isolated loopback *_ci / *_test DB.
 * All seeded records are rolled back. Not part of offline verification. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // must run BEFORE importing pg or connecting
const {default: pg}=await import('pg');
const {Client}=pg;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(root,'apps/api/src/contexts/geospatial/infrastructure/pg-parcel.repository.ts'),'utf8');
const result=/const step=await tx\.query\(`([\s\S]*?)`,\[isUuid\(sessionId\),u\.id,u\.organizationId\]\)/.exec(source);
if(!result)throw Error('Cannot find actual v0.21 review authorization query; revalidate the integration test');
const reviewSql=result[1];
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
await client.connect();
let began=false,checks=0;
const ids={org:randomUUID(),otherOrg:randomUUID(),user:randomUUID(),session:randomUUID(),application:randomUUID()};
const now=Date.now();
const inDays=days=>new Date(now+days*86400000);
async function expect(allowed,label){
 const response=await client.query(reviewSql,[ids.session,ids.user,ids.org]);
 assert.equal(response.rowCount,allowed?1:0,label);checks++;
}
try{
 await client.query('BEGIN');began=true;
 await client.query("SET LOCAL lock_timeout = '3s'");
 await client.query("SET LOCAL statement_timeout = '10s'");
 await client.query('INSERT INTO organizations(id,name) VALUES ($1,$2),($3,$4)',[ids.org,'V21 Disposable Security Org',ids.otherOrg,'V21 Different Org']);
 await client.query('INSERT INTO users(id,organization_id,full_name,email,password_hash,role,professional_approved) VALUES($1,$2,$3,$4,$5,$6,$7)',[ids.user,ids.org,'V21 Temporary Surveyor',`v21-${ids.user}@invalid.example`,'test-hash-not-a-credential','SURVEYOR',true]);
 await client.query("INSERT INTO auth_mfa_credentials(user_id,secret_ciphertext,enabled) VALUES($1,'synthetic-test-secret',true)",[ids.user]);
 await client.query(`INSERT INTO auth_sessions(id,user_id,organization_id,refresh_hash,device,expires_at,absolute_expires_at,mfa_verified_at)
 VALUES($1,$2,$3,$4,'v21-disposable', $5,$6,now())`,[ids.session,ids.user,ids.org,'0'.repeat(64),inDays(1),inDays(10)]);
 await client.query(`INSERT INTO professional_applications(id,applicant_id,organization_id,professional_role,regulator_name,licence_reference,licence_expires_at,explanation,status)
 VALUES($1,$2,$3,'SURVEYOR','TEST ONLY','NOT-A-REAL-LICENCE',$4,'Synthetic integration-only accreditation never exposed to users','APPROVED')`,[ids.application,ids.user,ids.org,inDays(30)]);
 await client.query(`INSERT INTO professional_accreditations(user_id,application_id,professional_role,expires_at) VALUES($1,$2,'SURVEYOR',$3)`,[ids.user,ids.application,inDays(30)]);
 await expect(true,'active accredited surveyor and active MFA may pass preliminary authorization');
 await client.query('UPDATE professional_accreditations SET revoked_at=now() WHERE user_id=$1',[ids.user]);
 await expect(false,'revoked accreditation must fail');
 await client.query('UPDATE professional_accreditations SET revoked_at=NULL,expires_at=$2 WHERE user_id=$1',[ids.user,inDays(-1)]);
 await expect(false,'expired accreditation must fail');
 await client.query('UPDATE professional_accreditations SET expires_at=$2 WHERE user_id=$1',[ids.user,inDays(30)]);
 await client.query("UPDATE users SET role='CLIENT' WHERE id=$1",[ids.user]);
 await expect(false,'changed role must fail');
 await client.query("UPDATE users SET role='SURVEYOR',organization_id=$2 WHERE id=$1",[ids.user,ids.otherOrg]);
 await expect(false,'changed organization must fail');
 await client.query('UPDATE users SET organization_id=$2 WHERE id=$1',[ids.user,ids.org]);
 await client.query('UPDATE auth_mfa_credentials SET enabled=false WHERE user_id=$1',[ids.user]);
 await expect(false,'disabled MFA must fail');
 await client.query('UPDATE auth_mfa_credentials SET enabled=true WHERE user_id=$1',[ids.user]);
 await client.query('UPDATE auth_sessions SET mfa_verified_at=now()-interval \'20 minutes\' WHERE id=$1',[ids.session]);
 await expect(false,'expired MFA step-up must fail');
 await client.query('UPDATE auth_sessions SET mfa_verified_at=now(),revoked_at=now() WHERE id=$1',[ids.session]);
 await expect(false,'revoked session must fail');
 await client.query('UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1',[ids.session]);
 await expect(true,'restored valid account passes preliminary authorization');
 console.log(`PASS ${checks} disposable PostgreSQL authorization assertions in ${target.databaseName}; all fixture records rolled back`);
} finally {
 if(began){try{await client.query('ROLLBACK')}catch(error){console.error('Rollback failed:',error.message);process.exitCode=1}}
 await client.end();
}
