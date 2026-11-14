import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { Database } from '../../../database';
import { AuditService } from '../../../audit';
import { hashOpaque, validateNewPassword } from '../domain/identity-policy';
import {checkResetDelivery, lookupDigest, makePasswordResetToken, normalizeResetEmail, PASSWORD_RESET_MAX_REQUESTS, validPasswordResetToken} from '../domain/password-reset-policy';
import {sendPasswordResetNotice} from './password-reset-delivery';

const GENERIC_RESPONSE={ok:true,message:'If this address belongs to an eligible account, password recovery instructions will be sent.'};
@Injectable()
export class PasswordResetService {
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 async request(emailInput:unknown):Promise<typeof GENERIC_RESPONSE> {
  const delivery=checkResetDelivery(process.env);
  if(!delivery.ok)throw new ServiceUnavailableException('Password recovery is temporarily unavailable');
  let email:string;
  try{email=normalizeResetEmail(emailInput)}catch{throw new BadRequestException('Invalid email address')}
  // PostgreSQL shared across API replicas; no clear email address is stored in the rate-limit table.
  const lookup=lookupDigest(email,process.env.PASSWORD_RESET_LOOKUP_PEPPER||'');
  const attempt=await this.db.query(`INSERT INTO auth_password_reset_windows(email_lookup_hash,request_count,window_started_at,last_request_at)
    VALUES($1,1,now(),now())
    ON CONFLICT(email_lookup_hash) DO UPDATE SET
     request_count=CASE WHEN auth_password_reset_windows.window_started_at<=now()-interval '1 hour' THEN 1 ELSE LEAST(auth_password_reset_windows.request_count+1,4) END,
     window_started_at=CASE WHEN auth_password_reset_windows.window_started_at<=now()-interval '1 hour' THEN now() ELSE auth_password_reset_windows.window_started_at END,
     last_request_at=now()
    RETURNING request_count`,[lookup]);
  if(Number(attempt.rows[0]?.request_count)>PASSWORD_RESET_MAX_REQUESTS)return GENERIC_RESPONSE;
  const {rows}=await this.db.query('SELECT id,email FROM users WHERE email=$1 AND suspended_at IS NULL',[email]);
  const account=rows[0];
  if(!account)return GENERIC_RESPONSE;
  const token=makePasswordResetToken();
  const requestId=randomUUID();
  await this.db.transaction(async tx=>{
   // One active request per account, including with concurrent duplicate reset attempts.
   await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[account.id]);
   await tx.query('UPDATE auth_password_reset_requests SET revoked_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL',[account.id]);
   await tx.query(`INSERT INTO auth_password_reset_requests(id,user_id,token_hash,expires_at,delivery_state)
     VALUES($1,$2,$3,now()+interval '15 minutes','PENDING')`,[requestId,account.id,hashOpaque(token)]);
  });
  try {
   await sendPasswordResetNotice(process.env,account.email,token);
   await this.db.query("UPDATE auth_password_reset_requests SET delivery_state='SENT' WHERE id=$1 AND revoked_at IS NULL AND delivery_state='PENDING'",[requestId]);
  }catch{
   // Fail closed even if a relay returns a network error after accepting a request.
   await this.db.query("UPDATE auth_password_reset_requests SET delivery_state='FAILED',revoked_at=now() WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL",[requestId]);
   // Never log email, reset URL, access token or relay credential.
   console.warn('Password recovery delivery unavailable; request invalidated.');
  }
  return GENERIC_RESPONSE;
 }
 async confirm(tokenInput:unknown,newPasswordInput:unknown):Promise<{ok:true;message:string}> {
  if(!validPasswordResetToken(tokenInput))throw new BadRequestException('Invalid or expired password reset link');
  try{validateNewPassword(newPasswordInput)}catch(err:any){throw new BadRequestException(err?.message||'Invalid new password')}
  const newPassword=newPasswordInput as string;
  // Reject random or already-used links cheaply before invoking expensive Argon2id.
  // This is only a preflight; the locked transaction below rechecks authority.
  const candidateHash=hashOpaque(tokenInput);
  const preflight=await this.db.query(`SELECT 1 FROM auth_password_reset_requests
    WHERE token_hash=$1 AND revoked_at IS NULL AND consumed_at IS NULL
      AND delivery_state='SENT' AND expires_at>now()`,[candidateHash]);
  if(!preflight.rows[0])throw new UnauthorizedException('Invalid or expired password reset link');
  // Calculate outside the DB transaction to minimize the time its row locks are held.
  const freshHash=await argon2.hash(newPassword,{type:argon2.argon2id});
  await this.db.transaction(async tx=>{
   // Lock the user first, matching request() ordering and avoiding user/token lock inversions.
   const owner=await tx.query('SELECT u.id FROM auth_password_reset_requests r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1',[candidateHash]);
   if(!owner.rows[0])throw new UnauthorizedException('Invalid or expired password reset link');
   await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner.rows[0].id]);
   const {rows}=await tx.query(`SELECT r.id,r.user_id,r.expires_at,r.consumed_at,r.revoked_at,r.delivery_state,
     u.password_hash,u.organization_id,u.role,u.email,u.full_name,u.suspended_at
     FROM auth_password_reset_requests r JOIN users u ON u.id=r.user_id
     WHERE r.token_hash=$1 FOR UPDATE OF r,u`,[candidateHash]);
   const request=rows[0];
   if(!request||request.revoked_at||request.consumed_at||request.delivery_state!=='SENT'||request.suspended_at||
      new Date(request.expires_at).getTime()<=Date.now())throw new UnauthorizedException('Invalid or expired password reset link');
   if(await argon2.verify(request.password_hash,newPassword))throw new BadRequestException('Choose a new password that differs from the old one');
   await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1',[request.user_id,freshHash]);
   await tx.query('UPDATE auth_password_reset_requests SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL',[request.id]);
   await tx.query('UPDATE auth_password_reset_requests SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL AND revoked_at IS NULL',[request.user_id,request.id]);
   await tx.query("UPDATE auth_sessions SET revoked_at=now(),revocation_reason='PASSWORD_RESET' WHERE user_id=$1 AND revoked_at IS NULL",[request.user_id]);
   await tx.query('UPDATE auth_login_challenges SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',[request.user_id]);
   await this.audit.write(tx,{id:request.user_id,organizationId:request.organization_id,fullName:request.full_name,email:request.email,role:request.role,professionalApproved:false},'PASSWORD_RESET_COMPLETED','user',request.user_id,{revokeAllSessions:true});
  });
  return {ok:true,message:'Password updated. Sign in again; previous sessions have been revoked.'};
 }
}
