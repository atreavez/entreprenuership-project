import { Body, Controller, Delete, Get, Injectable, Module, Post, Req, Res, UseGuards, CanActivate, ExecutionContext, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import { Database } from './database';
import { uid, text, UserAuth, hash } from './common';
import { AuditService } from './audit';
import { SessionUseCases } from './contexts/identity/application/session-usecases';
import { PgSessionRepository } from './contexts/identity/infrastructure/pg-session.repository';
import { CHALLENGE_TTL_MS, createMfaSecret, decodeBase32, hashOpaque, openSecret, sealSecret, validateNewPassword, verifyTotp, isValidRecoveryCode } from './contexts/identity/domain/identity-policy';

type AuthRequest=Request & {user:UserAuth;sessionId:string};
const REFRESH_COOKIE='assettrust_refresh';
// A fixed public Argon2id digest (not a credential) equalizes the costly
// verification work for unknown accounts and incorrect passwords. Never
// branch around argon2.verify solely because the user lookup returned no row.
const LOGIN_DUMMY_PASSWORD_HASH='$argon2id$v=19$m=65536,t=3,p=4$pARKw9o00YBzwQiQLcvuBg$c86MDqvTxooZceSLYWiH/QQEYap6x724B65BZWECNkM';
const COOKIE_PATH='/api/v1/auth';
function refreshCookie(res:Response,value:string){res.cookie(REFRESH_COOKIE,value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:COOKIE_PATH,maxAge:7*24*3600_000});}
function clearRefreshCookie(res:Response){res.clearCookie(REFRESH_COOKIE,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:COOKIE_PATH});}
function parseCookie(req:Request){const cookies=(req.headers.cookie||'').split(';');for(const item of cookies){const [key,...value]=item.trim().split('=');if(key===REFRESH_COOKIE)return decodeURIComponent(value.join('='));}return null;}
/** Defense in depth for endpoints which act on httpOnly refresh cookies. */
function assertSameOrigin(req:Request){const origin=req.headers.origin;if(origin){const allowed=(process.env.WEB_ORIGIN||'http://localhost:5173').split(',');if(!allowed.includes(origin))throw new ForbiddenException('Invalid request origin');}if(req.headers['sec-fetch-site']==='cross-site')throw new ForbiddenException('Cross-site credential request rejected');}
function mfaKey():Buffer{const value=process.env.MFA_ENCRYPTION_KEY||'';if(!/^[0-9a-f]{64}$/i.test(value))throw new ServiceUnavailableException('Authenticator security is not configured on this server');return Buffer.from(value,'hex');}
function validEmail(email:string){if(!/^\S+@\S+\.\S+$/.test(email))throw new BadRequestException('Invalid email');return email;}
function password(value:unknown){try{validateNewPassword(value)}catch(e:any){throw new BadRequestException(e.message)}return value as string;}
@Injectable()
export class AuthSessionService{
 readonly useCases:SessionUseCases;
 constructor(repo:PgSessionRepository,jwt:JwtService){this.useCases=new SessionUseCases(repo,{sign:(sub,sid,ttl)=>jwt.signAsync({sub:sub.id,org:sub.organizationId,sid},{expiresIn:ttl})});}
}
@Injectable()
export class AuthenticationService{
 constructor(private db:Database,private authSessions:AuthSessionService,private audit:AuditService){}
 async lookup(id:string,org:string):Promise<UserAuth>{const {rows}=await this.db.query(`SELECT u.id,u.organization_id,u.full_name,u.email,u.role,
  EXISTS(SELECT 1 FROM professional_accreditations p WHERE p.user_id=u.id AND p.professional_role=u.role AND p.revoked_at IS NULL AND p.expires_at>now()) AS professional_approved
  FROM users u WHERE u.id=$1 AND u.organization_id=$2`,[id,org]);if(!rows[0])throw new UnauthorizedException();const u=rows[0];return {id:u.id,organizationId:u.organization_id,fullName:u.full_name,email:u.email,role:u.role,professionalApproved:u.professional_approved};}
 private async publicSession(user:UserAuth,device:string){const tokens=await this.authSessions.useCases.create({id:user.id,organizationId:user.organizationId},device);return {...tokens,user};}
 async register(data:any,device='Unknown device'){
  const fullName=text(data?.fullName,'fullName',120);const organization=text(data?.organization,'organization',120);
  const email=validEmail(text(data?.email,'email',200).toLowerCase());const pw=password(data?.password);
  const orgId=uid(),userId=uid(),pwd=await argon2.hash(pw,{type:argon2.argon2id});
  try{await this.db.transaction(async tx=>{await tx.query('INSERT INTO organizations(id,name) VALUES ($1,$2)',[orgId,organization]);await tx.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5,'ORG_ADMIN')`,[userId,orgId,fullName,email,pwd]);});}
  catch(e:any){if(e?.code==='23505')throw new ConflictException('Email is already registered');throw e;}
  return this.publicSession({id:userId,organizationId:orgId,fullName,email,role:'ORG_ADMIN',professionalApproved:false},device);
 }
 async login(data:any,device='Unknown device'){
  const email=validEmail(text(data?.email,'email',200).toLowerCase());const pw=text(data?.password,'password',128);
  const {rows}=await this.db.query(`SELECT u.id,u.organization_id,u.full_name,u.email,u.password_hash,u.role,
    EXISTS(SELECT 1 FROM professional_accreditations p WHERE p.user_id=u.id AND p.professional_role=u.role AND p.revoked_at IS NULL AND p.expires_at>now()) AS professional_approved,
    m.enabled AS mfa_enabled
    FROM users u LEFT JOIN auth_mfa_credentials m ON m.user_id=u.id WHERE u.email=$1`,[email]);const u=rows[0];
  // Do not distinguish unknown accounts from wrong passwords.
  const passwordMatches=await argon2.verify(u?.password_hash ?? LOGIN_DUMMY_PASSWORD_HASH,pw);
  if(!u||!passwordMatches)throw new UnauthorizedException('Incorrect credentials');
  if(u.mfa_enabled){mfaKey();const challengeToken=randomBytes(32).toString('base64url');const expires=new Date(Date.now()+CHALLENGE_TTL_MS);
   await this.db.query('INSERT INTO auth_login_challenges(id,user_id,challenge_hash,expires_at) VALUES($1,$2,$3,$4)',[uid(),u.id,hashOpaque(challengeToken),expires]);
   return {mfaRequired:true,challengeToken,expiresIn:CHALLENGE_TTL_MS/1000};
  }
  return this.publicSession({id:u.id,organizationId:u.organization_id,fullName:u.full_name,email:u.email,role:u.role,professionalApproved:u.professional_approved},device);
 }
 async completeMfa(body:any,device='Unknown device'){
  const challenge=text(body?.challengeToken,'challengeToken',150),code=body?.code,backupCode=body?.backupCode;
  const subject=await this.db.transaction(async tx=>{
   const {rows}=await tx.query(`SELECT c.id,c.user_id,c.expires_at,c.attempts,c.consumed_at,m.secret_ciphertext,m.last_used_step,m.enabled,u.organization_id
     FROM auth_login_challenges c JOIN auth_mfa_credentials m ON m.user_id=c.user_id JOIN users u ON u.id=c.user_id WHERE c.challenge_hash=$1 FOR UPDATE OF c,m`,[hashOpaque(challenge)]);
   const c=rows[0];if(!c||!c.enabled||c.consumed_at||c.attempts>=5||new Date(c.expires_at).getTime()<=Date.now())return null;
   let success=false;let step:number|null=null;
   if(typeof code==='string'){step=verifyTotp(decodeBase32(openSecret(c.secret_ciphertext,mfaKey())),code,Date.now(),Number(c.last_used_step));success=step!==null;}
   if(!success&&isValidRecoveryCode(backupCode)){
    const used=await tx.query('UPDATE auth_recovery_codes SET consumed_at=now() WHERE user_id=$1 AND code_hash=$2 AND consumed_at IS NULL RETURNING id',[c.user_id,hashOpaque(backupCode)]);success=used.rowCount===1;
   }
   if(!success){await tx.query('UPDATE auth_login_challenges SET attempts=attempts+1 WHERE id=$1',[c.id]);return null;}
   if(step!==null)await tx.query('UPDATE auth_mfa_credentials SET last_used_step=$2 WHERE user_id=$1',[c.user_id,step]);
   await tx.query('UPDATE auth_login_challenges SET consumed_at=now() WHERE id=$1',[c.id]);return {id:c.user_id,organizationId:c.organization_id};
  });
  if(!subject)throw new UnauthorizedException('Invalid or expired MFA challenge');
  const session=await this.publicSession(await this.lookup(subject.id,subject.organizationId),device);
  await this.db.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2',[session.sessionId,subject.id]);
  return session;
 }
 async stepUpMfa(user:UserAuth,sessionId:string,code:unknown){
  await this.db.transaction(async tx=>{
   const {rows}=await tx.query('SELECT secret_ciphertext,enabled,last_used_step FROM auth_mfa_credentials WHERE user_id=$1 FOR UPDATE',[user.id]);
   const cred=rows[0];if(!cred?.enabled)throw new ForbiddenException('Authenticator MFA must be enabled');
   const step=verifyTotp(decodeBase32(openSecret(cred.secret_ciphertext,mfaKey())),code,Date.now(),Number(cred.last_used_step));
   if(step===null)throw new UnauthorizedException('Invalid or previously used authenticator code');
   await tx.query('UPDATE auth_mfa_credentials SET last_used_step=$2 WHERE user_id=$1',[user.id,step]);
   const session=await tx.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',[sessionId,user.id]);
   if(!session.rows.length)throw new UnauthorizedException('Session is no longer active');
   await this.audit.write(tx,user,'MFA_STEP_UP','user',user.id,{purpose:'SENSITIVE_PROFESSIONAL_REVIEW'});
  });return {ok:true,verifiedForMinutes:15};
 }
 async mfaStatus(user:UserAuth){const {rows}=await this.db.query('SELECT enabled,confirmed_at FROM auth_mfa_credentials WHERE user_id=$1',[user.id]);const enabled=!!rows[0]?.enabled;const {rows:backup}=await this.db.query('SELECT COUNT(*)::int AS count FROM auth_recovery_codes WHERE user_id=$1 AND consumed_at IS NULL',[user.id]);return {enabled,confirmedAt:rows[0]?.confirmed_at||null,recoveryCodesRemaining:backup[0].count};}
 private async assertPassword(user:UserAuth,pw:unknown){const value=text(pw,'currentPassword',128);const {rows}=await this.db.query('SELECT password_hash FROM users WHERE id=$1 AND organization_id=$2',[user.id,user.organizationId]);if(!rows[0]||!await argon2.verify(rows[0].password_hash,value))throw new UnauthorizedException('Incorrect current password');}
 async beginMfa(user:UserAuth,pw:unknown){await this.assertPassword(user,pw);const key=mfaKey();const secret=createMfaSecret();
  await this.db.transaction(async tx=>{const existing=await tx.query('SELECT enabled FROM auth_mfa_credentials WHERE user_id=$1 FOR UPDATE',[user.id]);if(existing.rows[0]?.enabled)throw new ConflictException('MFA already enabled');await tx.query(`INSERT INTO auth_mfa_credentials(user_id,secret_ciphertext,enabled,last_used_step) VALUES($1,$2,false,-1) ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,enabled=false,last_used_step=-1`,[user.id,sealSecret(secret,key)]);await tx.query('DELETE FROM auth_recovery_codes WHERE user_id=$1',[user.id]);await this.audit.write(tx,user,'MFA_ENROLLMENT_STARTED','user',user.id,{});});
  const label=encodeURIComponent(`AssetTrust:${user.email}`);return {secret,otpauthUri:`otpauth://totp/${label}?secret=${secret}&issuer=AssetTrust&algorithm=SHA1&digits=6&period=30`,notice:'Save this setup secret privately. Confirm with the six-digit code to activate MFA.'};
 }
 async confirmMfa(user:UserAuth,sessionId:string,code:unknown){const recoveryCodes=Array.from({length:10},()=>randomBytes(10).toString('base64url'));
  await this.db.transaction(async tx=>{const {rows}=await tx.query('SELECT secret_ciphertext,enabled,last_used_step FROM auth_mfa_credentials WHERE user_id=$1 FOR UPDATE',[user.id]);const c=rows[0];if(!c||c.enabled)throw new BadRequestException('No pending MFA setup');const step=verifyTotp(decodeBase32(openSecret(c.secret_ciphertext,mfaKey())),code,Date.now(),Number(c.last_used_step));if(step===null)throw new UnauthorizedException('Invalid authenticator code');await tx.query('UPDATE auth_mfa_credentials SET enabled=true,confirmed_at=now(),last_used_step=$2 WHERE user_id=$1',[user.id,step]);for(const code of recoveryCodes)await tx.query('INSERT INTO auth_recovery_codes(id,user_id,code_hash) VALUES($1,$2,$3)',[uid(),user.id,hashOpaque(code)]);await tx.query("UPDATE auth_sessions SET revoked_at=now(),revocation_reason='MFA_ENABLED' WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",[user.id,sessionId]);await tx.query('UPDATE auth_sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2',[sessionId,user.id]);await this.audit.write(tx,user,'MFA_ENABLED','user',user.id,{});});
  return {enabled:true,recoveryCodes,notice:'Keep these one-time recovery codes offline. They will not be shown again.'};
 }
 async disableMfa(user:UserAuth,sessionId:string,body:any){await this.assertPassword(user,body?.currentPassword);
  await this.db.transaction(async tx=>{const {rows}=await tx.query('SELECT secret_ciphertext,enabled,last_used_step FROM auth_mfa_credentials WHERE user_id=$1 FOR UPDATE',[user.id]);const m=rows[0];if(!m?.enabled)throw new BadRequestException('MFA is not enabled');
   const step=verifyTotp(decodeBase32(openSecret(m.secret_ciphertext,mfaKey())),body?.code,Date.now(),Number(m.last_used_step));let authorized=step!==null;
   if(!authorized&&isValidRecoveryCode(body?.backupCode)){
    // Only unconsumed recovery codes may authorize MFA removal. A previously
    // used login recovery code must never be reusable as a disable factor.
    const r=await tx.query('DELETE FROM auth_recovery_codes WHERE user_id=$1 AND code_hash=$2 AND consumed_at IS NULL RETURNING id',[user.id,hashOpaque(body.backupCode)]);
    authorized=r.rowCount===1;
   }
   if(!authorized)throw new UnauthorizedException('Invalid MFA code');
   await tx.query('DELETE FROM auth_mfa_credentials WHERE user_id=$1',[user.id]);await tx.query('DELETE FROM auth_recovery_codes WHERE user_id=$1',[user.id]);
   // Never preserve an earlier step-up authorization after MFA is disabled.
   // The current session remains usable for non-sensitive requests, but is no
   // longer eligible for an operation that requires fresh MFA.
   await tx.query('UPDATE auth_sessions SET mfa_verified_at=NULL WHERE user_id=$1',[user.id]);
   await tx.query("UPDATE auth_sessions SET revoked_at=now(),revocation_reason='MFA_DISABLED' WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",[user.id,sessionId]);
   await this.audit.write(tx,user,'MFA_DISABLED','user',user.id,{});
  });return {enabled:false};
 }
 async changePassword(user:UserAuth,sessionId:string,body:any){const currentPassword=text(body?.currentPassword,'currentPassword',128),newPassword=password(body?.newPassword);
  const digest=await argon2.hash(newPassword,{type:argon2.argon2id});
  await this.db.transaction(async tx=>{
   // Lock the credential before validating it; concurrent password changes cannot both succeed using the old password.
   const {rows}=await tx.query('SELECT password_hash FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE',[user.id,user.organizationId]);
   if(!rows[0]||!await argon2.verify(rows[0].password_hash,currentPassword))throw new UnauthorizedException('Incorrect current password');
   if(await argon2.verify(rows[0].password_hash,newPassword))throw new BadRequestException('New password must be different');
   await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1 AND organization_id=$3',[user.id,digest,user.organizationId]);
   await tx.query("UPDATE auth_sessions SET revoked_at=now(),revocation_reason='PASSWORD_CHANGED' WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",[user.id,sessionId]);
   await this.audit.write(tx,user,'PASSWORD_CHANGED','user',user.id,{});
  });
  return {ok:true,notice:'Password updated; other sessions have been revoked.'};
 }
}
@Injectable()
export class AuthGuard implements CanActivate{
 constructor(private auth:AuthenticationService,private jwt:JwtService,private sessions:AuthSessionService){}
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest<AuthRequest>();const header=req.headers.authorization;
  if(!header?.startsWith('Bearer '))throw new UnauthorizedException('Missing access token');
  try{const p=await this.jwt.verifyAsync<{sub:string;org:string;sid:string}>(header.slice(7),{issuer:'assettrust-api',audience:'assettrust-web'});
   if(!p.sid||!await this.sessions.useCases.authorize(p.sid,{id:p.sub,organizationId:p.org}))throw new Error('Revoked session');
   req.user=await this.auth.lookup(p.sub,p.org);req.sessionId=p.sid;return true;
  }catch{throw new UnauthorizedException('Invalid, expired or revoked access token');}
 }
}
@Controller('auth')
export class AuthController{
 constructor(private auth:AuthenticationService,private sessions:AuthSessionService){}
 private respondSession(response:Response,session:any){refreshCookie(response,session.refreshToken);const {refreshToken,sessionId,...safe}=session;return safe;}
 @Throttle({default:{limit:5,ttl:60000}})@Post('register')async register(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:any){assertSameOrigin(req);const result=await this.auth.register(body,req.headers['user-agent']||'Unknown device');return this.respondSession(res,result);}
 @Throttle({default:{limit:8,ttl:60000}})@Post('login')async login(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:any){assertSameOrigin(req);const result=await this.auth.login(body,req.headers['user-agent']||'Unknown device');return 'mfaRequired' in result?result:this.respondSession(res,result);}
 @Throttle({default:{limit:6,ttl:60000}})@Post('mfa/complete')async complete(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:any){assertSameOrigin(req);return this.respondSession(res,await this.auth.completeMfa(body,req.headers['user-agent']||'Unknown device'));}
 @Throttle({default:{limit:12,ttl:60000}})@Post('refresh')async refresh(@Req()req:Request,@Res({passthrough:true})res:Response){assertSameOrigin(req);const cookie=parseCookie(req);if(!cookie)throw new UnauthorizedException('No refresh session');try{const result=await this.sessions.useCases.refresh(cookie);const user=await this.auth.lookup(result.subject.id,result.subject.organizationId);return this.respondSession(res,{...result,user});}catch{clearRefreshCookie(res);throw new UnauthorizedException('Refresh session invalid or expired');}}
 @Get('me')@UseGuards(AuthGuard)me(@Req()req:AuthRequest){return req.user;}
 @Post('logout')@UseGuards(AuthGuard)async logout(@Req()req:AuthRequest,@Res({passthrough:true})res:Response){assertSameOrigin(req);await this.sessions.useCases.revoke(req.sessionId,req.user.id);clearRefreshCookie(res);return {ok:true};}
 @Post('logout-all')@UseGuards(AuthGuard)async logoutAll(@Req()req:AuthRequest,@Res({passthrough:true})res:Response){assertSameOrigin(req);await this.sessions.useCases.revokeAll(req.user.id);clearRefreshCookie(res);return {ok:true};}
 @Get('sessions')@UseGuards(AuthGuard)async list(@Req()req:AuthRequest){return {currentSessionId:req.sessionId,sessions:await this.sessions.useCases.list(req.user.id)};}
 @Post('sessions/revoke')@UseGuards(AuthGuard)async revoke(@Req()req:AuthRequest,@Res({passthrough:true})res:Response,@Body()body:any){const id=text(body?.sessionId,'sessionId',36);await this.sessions.useCases.revoke(id,req.user.id);if(id===req.sessionId)clearRefreshCookie(res);return {ok:true,currentSessionRevoked:id===req.sessionId};}
 @Post('password/change')@UseGuards(AuthGuard)passwordChange(@Req()req:AuthRequest,@Body()body:any){return this.auth.changePassword(req.user,req.sessionId,body);}
 @Throttle({default:{limit:5,ttl:60000}})@Post('mfa/step-up')@UseGuards(AuthGuard)stepUp(@Req()req:AuthRequest,@Body()body:any){return this.auth.stepUpMfa(req.user,req.sessionId,body?.code);}
 @Get('mfa/status')@UseGuards(AuthGuard)status(@Req()req:AuthRequest){return this.auth.mfaStatus(req.user);}
 @Post('mfa/enroll')@UseGuards(AuthGuard)@Throttle({default:{limit:3,ttl:60000}})enroll(@Req()req:AuthRequest,@Body()body:any){return this.auth.beginMfa(req.user,body?.currentPassword);}
 @Post('mfa/confirm')@UseGuards(AuthGuard)@Throttle({default:{limit:5,ttl:60000}})confirm(@Req()req:AuthRequest,@Body()body:any){return this.auth.confirmMfa(req.user,req.sessionId,body?.code);}
 @Post('mfa/disable')@UseGuards(AuthGuard)@Throttle({default:{limit:5,ttl:60000}})disable(@Req()req:AuthRequest,@Body()body:any){return this.auth.disableMfa(req.user,req.sessionId,body);}
}
@Module({imports:[JwtModule.register({secret:process.env.JWT_SECRET,signOptions:{issuer:'assettrust-api',audience:'assettrust-web'}})],providers:[AuditService,PgSessionRepository,AuthSessionService,AuthenticationService,AuthGuard],controllers:[AuthController],exports:[AuthenticationService,AuthGuard,AuthSessionService,JwtModule]})export class AuthModule{}
