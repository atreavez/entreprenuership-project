/**
 * Trusted infrastructure-operator bootstrap. No public HTTP route can grant platform-admin access.
 * Dry-run by default. Requires a DB operator, an existing ORG_ADMIN account with enabled MFA,
 * and explicit matching confirmations. Cannot be used for subsequent appointments.
 */
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const hash=v=>createHash('sha256').update(v).digest('hex');
async function main(){
 const email=process.env.ASSETTRUST_PLATFORM_ADMIN_EMAIL?.trim()?.toLowerCase();
 if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('ASSETTRUST_PLATFORM_ADMIN_EMAIL must name an existing administrator');
 const apply=process.argv.includes('--apply');
 if(apply && (process.env.ASSETTRUST_BOOTSTRAP_CONFIRM!=='I_AUTHORIZE_PLATFORM_ADMIN' || process.env.ASSETTRUST_BOOTSTRAP_EMAIL?.trim()?.toLowerCase()!==email))
  throw Error('Refusing platform-admin grant: two explicit operator confirmations are required');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL missing');
 const {Client}=require('pg');
 const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-platform-bootstrap-v28'});
 await db.connect();try{
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(2182819)');
  const appointments=await db.query('SELECT 1 FROM platform_admin_appointments LIMIT 1');
  if(appointments.rows.length)throw Error('Initial platform administrator already bootstrapped. Subsequent grants require a separate audited governance workflow.');
  const {rows}=await db.query(`SELECT u.id,u.organization_id FROM users u
     JOIN auth_mfa_credentials m ON m.user_id=u.id AND m.enabled=true
     WHERE lower(u.email)=$1 AND u.role='ORG_ADMIN' FOR SHARE OF u,m`,[email]);
  if(rows.length!==1)throw Error('Account must be an existing ORG_ADMIN with enabled MFA');
  if(!apply){console.log('DRY RUN: eligible existing administrator with enabled MFA; no changes made.');await db.query('ROLLBACK');return;}
  const actor=rows[0];
  await db.query(`INSERT INTO platform_admin_appointments(user_id,granted_by,grant_source)
    VALUES ($1,$1,'OPERATOR_BOOTSTRAP')`,[actor.id]);
  // Write into the original organization's append-only hash chain, exactly like AuditService.write.
  await db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[actor.organization_id]);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.organization_id]);
  const last=await db.query('SELECT event_hash FROM audit_events WHERE organization_id=$1 ORDER BY event_sequence DESC LIMIT 1',[actor.organization_id]);
  const previous=last.rows[0]?.event_hash||'GENESIS';
  const timestamp=new Date().toISOString(),detail={method:'trusted_operator',scope:'platform',mfaRequired:true};
  const eventHash=hash(JSON.stringify([actor.organization_id,actor.id,'PLATFORM_ADMIN_BOOTSTRAPPED','platform_admin',actor.id,canon(detail),timestamp,previous]));
  await db.query(`INSERT INTO audit_events(id,organization_id,actor_id,action,entity_type,entity_id,detail,previous_hash,event_hash,created_at)
     VALUES($1,$2,$3,'PLATFORM_ADMIN_BOOTSTRAPPED','platform_admin',$3,$4::jsonb,$5,$6,$7)`,[randomUUID(),actor.organization_id,actor.id,JSON.stringify(detail),previous,eventHash,timestamp]);
  await db.query('COMMIT');
  console.log('Platform administrator appointment recorded and audit-linked. Account:',email);
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{await db.end()}
}
main().catch(e=>{console.error('Bootstrap refused:',e.message);process.exitCode=1});
