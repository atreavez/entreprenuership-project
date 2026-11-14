/** v0.27: Transaction-rolled-back PostgreSQL verification; must never target production. */
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function target(){
 if(process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES')throw new Error('Explicit ASSETTRUST_E2E_ALLOW_MUTATION=YES required');
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 const url=new URL(process.env.DATABASE_URL);
 if(!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname))throw new Error('PostgreSQL must be a local disposable test instance');
 if(!/(?:test|ci|disposable)/i.test(decodeURIComponent(url.pathname.slice(1))))throw new Error('Database name must explicitly be test/ci/disposable');
 return process.env.DATABASE_URL;
}
// Fail before opening sockets or importing application dependencies.
let connection;
try{connection=target()}catch(e){console.error('BLOCKED:',e.message);process.exit(2)}
require('ts-node/register');
const {assertCurrentAdminStepUp}=require('../apps/api/src/contexts/identity/infrastructure/current-admin-step-up.ts');
const {Client}=await import('pg').then(x=>x.default);
const client=new Client({connectionString:connection,connectionTimeoutMillis:5000,application_name:'assettrust-v27-disposable-check'});
const org=randomUUID(),admin=randomUUID(),session=randomUUID(),email=`coadmin-check-${randomUUID()}@example.invalid`;
const actor={id:admin,organizationId:org,role:'ORG_ADMIN'};
async function denied(message){let denied=false;try{await assertCurrentAdminStepUp(client,actor,session)}catch{denied=true}if(!denied)throw new Error('Expected denial: '+message)}
try{
 await client.connect();
 await client.query('BEGIN');
 const migrations=await client.query("SELECT filename FROM assettrust_schema_migrations WHERE filename='008_coadmin_invitation.sql'");
 if(migrations.rowCount!==1)throw new Error('v0.27 migration missing');
 await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[org,'Disposable v27 organization']);
 await client.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Disposable Admin',$3,'nonlogin-test-hash','ORG_ADMIN')",[admin,org,email]);
 await client.query("INSERT INTO auth_mfa_credentials(user_id,secret_ciphertext,enabled) VALUES($1,'nonlogin-test-sealed-secret',true)",[admin]);
 await client.query(`INSERT INTO auth_sessions(id,user_id,organization_id,refresh_hash,expires_at,absolute_expires_at,mfa_verified_at)
    VALUES($1,$2,$3,$4,now()+interval '1 hour',now()+interval '2 hours',now())`,[session,admin,org,'a'.repeat(64)]);
 await assertCurrentAdminStepUp(client,actor,session);
 await client.query("UPDATE auth_sessions SET mfa_verified_at=now()-interval '10 minutes' WHERE id=$1",[session]);
 await denied('stale step-up');
 await client.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE id=$1',[session]);
 await client.query('UPDATE auth_mfa_credentials SET enabled=false WHERE user_id=$1',[admin]);
 await denied('disabled MFA');
 await client.query('UPDATE auth_mfa_credentials SET enabled=true WHERE user_id=$1',[admin]);
 await client.query('UPDATE users SET role=$2 WHERE id=$1',[admin,'CLIENT']);
 await denied('role downgrade');
 await client.query('UPDATE users SET role=$2 WHERE id=$1',[admin,'ORG_ADMIN']);
 await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[session]);
 await denied('revoked session');
 await client.query('UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1',[session]);
 await client.query(`INSERT INTO team_invitations(id,organization_id,email,role,token_hash,expires_at,created_by)
    VALUES($1,$2,$3,'ORG_ADMIN',$4,now()+interval '1 hour',$5)`,[randomUUID(),org,`invited-${randomUUID()}@example.invalid`,'b'.repeat(64),admin]);
 const invitations=await client.query("SELECT role FROM team_invitations WHERE organization_id=$1 AND role='ORG_ADMIN'",[org]);
 if(invitations.rowCount!==1)throw new Error('Privileged invite role rejected by schema');
 console.log('PASS: migration, live step-up, stale step-up, disabled MFA, role downgrade, revoked session, coadmin constraint');
}finally{
 try{await client.query('ROLLBACK')}finally{await client.end().catch(()=>{})}
}
