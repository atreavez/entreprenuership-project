/** OPERATOR-ONLY CONTROL. No route or user action can appoint a platform trust reviewer. */
import 'dotenv/config';
import pg from 'pg';
const argv=process.argv.slice(2);const arg=name=>{const i=argv.indexOf(name);return i<0?null:argv[i+1]};
const action=arg('--action'),userId=arg('--user-id'),reference=arg('--reference'),operator=arg('--operator'),reason=arg('--reason');
if(process.env.TRUST_REVIEWER_BOOTSTRAP_APPROVED!=='yes'||!argv.includes('--confirm')||!['appoint','disable'].includes(action)||
 !/^[0-9a-f-]{36}$/i.test(userId||'')||!operator||operator.length<6|| (action==='appoint'&&(!reference||reference.length<12))||
 (action==='disable'&&(!reason||reason.length<20))){
 console.error('Use only under a separately approved operator change. Set TRUST_REVIEWER_BOOTSTRAP_APPROVED=yes, then');
 console.error('  --action appoint --user-id <uuid> --reference <approved-ticket-12+> --operator <operator-name> --confirm');
 console.error('or --action disable --user-id <uuid> --reason <20+ character incident reason> --operator <operator-name> --confirm');
 process.exit(2);
}
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL missing');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
try{
 await client.query('BEGIN');
 const user=await client.query(`SELECT u.id,u.email,u.organization_id,m.enabled
  FROM users u JOIN auth_mfa_credentials m ON m.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u,m`,[userId]);
 if(!user.rows[0])throw new Error('User and enabled MFA credential must exist before appointment');
 if(action==='appoint'){
  if(!user.rows[0].enabled)throw new Error('MFA is required prior to a trust appointment');
  await client.query(`INSERT INTO platform_trust_reviewers(user_id,appointment_reference,appointed_by_operator)
   VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET appointment_reference=EXCLUDED.appointment_reference,
   appointed_by_operator=EXCLUDED.appointed_by_operator,appointed_at=now(),disabled_at=NULL`,[userId,reference,operator]);
 }else{
  const disabled=await client.query('UPDATE platform_trust_reviewers SET disabled_at=now() WHERE user_id=$1 AND disabled_at IS NULL RETURNING user_id',[userId]);
  if(!disabled.rows.length)throw new Error('No active trust appointment to disable');
 }
 await client.query('COMMIT');console.log(JSON.stringify({action,userId,operator,notice:'Operator-controlled appointment change recorded. Never use self-service to grant these privileges.'}));
}catch(e){await client.query('ROLLBACK');console.error(e.message);process.exitCode=1}finally{await client.end()}
