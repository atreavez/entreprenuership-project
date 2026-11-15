import {HttpException, HttpStatus, Injectable, ServiceUnavailableException} from '@nestjs/common';
import {Database} from '../../../database';
import {loginIdentityKey,loginBlocked} from '../domain/login-abuse-policy';
/** Shared PostgreSQL counter across independent API instances. Never write the login identity itself. */
@Injectable()
export class LoginAbuseService {
 constructor(private readonly db:Database){}
 private key(raw:unknown):string {
  try{return loginIdentityKey(raw,process.env.LOGIN_ABUSE_PEPPER||'')}
  catch {throw new ServiceUnavailableException('Login security is not configured or identity is invalid')}
 }
 /** Reserve an attempt BEFORE Argon2id. Atomic across all API instances under PK row lock.
  * A burst of concurrent requests cannot all bypass a stale read-side check. */
 async reserveAttempt(raw:unknown):Promise<void> {
  const key=this.key(raw);
  const result=await this.db.query(`INSERT INTO auth_login_abuse_windows(identity_hash,attempt_count,window_started_at,last_attempt_at)
   VALUES($1,1,now(),now())
   ON CONFLICT(identity_hash) DO UPDATE SET
    attempt_count=CASE WHEN auth_login_abuse_windows.blocked_until>now() THEN 11
      WHEN auth_login_abuse_windows.window_started_at<=now()-interval '15 minutes'
      THEN 1 ELSE LEAST(11,auth_login_abuse_windows.attempt_count+1) END,
    blocked_until=CASE WHEN auth_login_abuse_windows.blocked_until>now() THEN auth_login_abuse_windows.blocked_until
      WHEN auth_login_abuse_windows.window_started_at<=now()-interval '15 minutes' THEN NULL
      WHEN auth_login_abuse_windows.attempt_count>=10 THEN now()+interval '15 minutes' ELSE NULL END,
    window_started_at=CASE WHEN auth_login_abuse_windows.blocked_until>now() THEN auth_login_abuse_windows.window_started_at
      WHEN auth_login_abuse_windows.window_started_at<=now()-interval '15 minutes'
      THEN now() ELSE auth_login_abuse_windows.window_started_at END,
    last_attempt_at=now()
   RETURNING attempt_count,blocked_until,now() AS checked_at`,[key]);
  const row=result.rows[0];
  if(!row)throw new ServiceUnavailableException('Login security database is unavailable');
  if(Number(row.attempt_count)>10 || loginBlocked(row,new Date(row.checked_at)))
   throw new HttpException('Too many login attempts; try again later',HttpStatus.TOO_MANY_REQUESTS);
 }
 async clearAfterPasswordProof(raw:unknown):Promise<void> {
  // Never clear the record merely because an email exists or a challenge was presented.
  await this.db.query('DELETE FROM auth_login_abuse_windows WHERE identity_hash=$1',[this.key(raw)]);
 }
}
