/** Run exact professional trust authorization SQL against a disposable, migrated PostgreSQL database.
 * The transaction ALWAYS rolls back fixture data; this is a local-only test, not production evidence. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env); // Reject unsafe database targets BEFORE loading pg or networking.
const {default:pg}=await import('pg');
const {Client}=pg;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=readFileSync(resolve(root,'apps/api/src/contexts/professional-trust/infrastructure/pg-trust.repository.ts'),'utf8');
const service=readFileSync(resolve(root,'apps/api/src/professional-trust.ts'),'utf8');
const sqlFrom=(code,pattern,label)=>{const match=pattern.exec(code);if(!match)throw Error(`Cannot locate actual ${label} SQL; review test extraction after refactoring`);return match[1];};
const queries=[
  sqlFrom(repo,/connection\.query\(`(SELECT u\.id[\s\S]*?)`,\[id,sessionId\]\)/,'transactional reviewer attestation'),
  sqlFrom(service,/this\.db\.query\(`(SELECT pr\.user_id[\s\S]*?)`,\[user\.id,sessionId\]\)/,'reviewer queue precheck'),
  sqlFrom(service,/tx\.query\(`(SELECT 1 FROM platform_trust_reviewers[\s\S]*?)`,\[user\.id,sessionId\]\)/,'transactional accreditation revocation')
];
for(const [i,sql] of queries.entries())assert.match(sql,/s\.expires_at\s*>\s*now\(\)/,`Authorizer ${i+1} lacks expiry gate`);
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
const id={org:randomUUID(),reviewer:randomUUID(),session:randomUUID()};
const days=n=>new Date(Date.now()+n*86400000);
let begun=false,assertions=0;
async function expectAll(allowed,label){
 for(const [index,sql] of queries.entries()){
  const response=await client.query(sql,[id.reviewer,id.session]);
  assert.equal(response.rowCount,allowed?1:0,`${label} (authorizer ${index+1})`);assertions++;
 }
}
try{
 await client.connect();await client.query('BEGIN');begun=true;
 await client.query("SET LOCAL lock_timeout='3s'");
 await client.query("SET LOCAL statement_timeout='10s'");
 await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[id.org,'V22 disposable org']);
 await client.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
 VALUES($1,$2,$3,$4,$5,'REVIEWER')`,[id.reviewer,id.org,'Temporary trust reviewer',`v22-${id.reviewer}@invalid.example`,'not-a-credential']);
 await client.query(`INSERT INTO platform_trust_reviewers(user_id,appointment_reference,appointed_by_operator)
 VALUES($1,'V22-TEST-APPOINTMENT','DISPOSABLE-TEST-ONLY')`,[id.reviewer]);
 await client.query("INSERT INTO auth_mfa_credentials(user_id,secret_ciphertext,enabled) VALUES($1,'not-a-secret',true)",[id.reviewer]);
 await client.query(`INSERT INTO auth_sessions(id,user_id,organization_id,refresh_hash,device,expires_at,absolute_expires_at,mfa_verified_at)
 VALUES($1,$2,$3,$4,'v22-disposable',$5,$6,now())`,[id.session,id.reviewer,id.org,'0'.repeat(64),days(1),days(30)]);
 await expectAll(true,'valid active session passes');
 await client.query('UPDATE auth_sessions SET expires_at=$2 WHERE id=$1',[id.session,days(-1)]);
 await expectAll(false,'expired access session must fail even with recent MFA');
 await client.query('UPDATE auth_sessions SET expires_at=$2,revoked_at=now() WHERE id=$1',[id.session,days(1)]);
 await expectAll(false,'revoked access session must fail');
 await client.query("UPDATE auth_sessions SET revoked_at=NULL,mfa_verified_at=now()-interval '20 minutes' WHERE id=$1",[id.session]);
 await expectAll(false,'stale MFA verification must fail');
 await client.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE id=$1',[id.session]);
 await client.query('UPDATE auth_mfa_credentials SET enabled=false WHERE user_id=$1',[id.reviewer]);
 await expectAll(false,'disabled MFA must fail');
 await client.query('UPDATE auth_mfa_credentials SET enabled=true WHERE user_id=$1',[id.reviewer]);
 await client.query('UPDATE platform_trust_reviewers SET disabled_at=now() WHERE user_id=$1',[id.reviewer]);
 await expectAll(false,'disabled appointment must fail');
 await client.query('UPDATE platform_trust_reviewers SET disabled_at=NULL WHERE user_id=$1',[id.reviewer]);
 await expectAll(true,'restored session/appointment passes');
 console.log(`PASS ${assertions} disposable PostgreSQL authorizer assertions (${target.databaseName}); all fixtures rolled back`);
}finally{
 if(begun)try{await client.query('ROLLBACK')}catch(error){process.exitCode=1;console.error('ROLLBACK FAILED',error.message)}
 await client.end().catch(()=>{});
}
