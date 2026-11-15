import { Body,Controller,Get,Post,Req,UseGuards,Injectable,Module,Param,BadRequestException,ConflictException,NotFoundException,ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { assertCurrentAdminStepUp } from './contexts/identity/infrastructure/current-admin-step-up';
import { canAcceptCoAdminInvitation, COADMIN_INVITE_TTL_MS } from './contexts/identity/domain/coadmin-policy';
import { validateNewPassword } from './contexts/identity/domain/identity-policy';
import { Throttle } from '@nestjs/throttler';
import argon2 from 'argon2';
import { Database } from './database';
import { AuthGuard,AuthModule } from './auth';
import { AuditModule,AuditService } from './audit';
import { UserAuth, assertRole,hash,uid,text,enumValue,isUuid } from './common';
// Ordinary invitations intentionally cannot grant administrator authority.
const INVITE_ROLES=['CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'] as const;
export function invitationExpired(expiry:Date,now=Date.now()){return !Number.isFinite(expiry.getTime()) || expiry.getTime()<=now;}
@Injectable()
export class TeamService{
 constructor(private db:Database,private audit:AuditService){}
 async list(u:UserAuth){assertRole(u,['ORG_ADMIN']);const {rows}=await this.db.query(`SELECT u.id,u.full_name,u.email,u.role,u.created_at,
  EXISTS(SELECT 1 FROM professional_accreditations p WHERE p.user_id=u.id AND p.professional_role=u.role AND p.revoked_at IS NULL AND p.expires_at>now()) AS professional_approved
  FROM users u WHERE u.organization_id=$1 ORDER BY u.created_at`,[u.organizationId]);return rows;}
 async invitations(u:UserAuth){assertRole(u,['ORG_ADMIN']);const {rows}=await this.db.query('SELECT id,email,role,expires_at,accepted_at,created_at FROM team_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',[u.organizationId]);return rows;}
 async invite(u:UserAuth,b:any){assertRole(u,['ORG_ADMIN']);const email=text(b?.email,'email',200).toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))throw new BadRequestException('Invalid email');const role=enumValue(b?.role,INVITE_ROLES,'role');const token=randomBytes(32).toString('base64url');const expires=new Date(Date.now()+48*3600_000);
  await this.db.transaction(async tx=>{const existing=await tx.query('SELECT 1 FROM users WHERE email=$1',[email]);if(existing.rows.length)throw new ConflictException('This email already has an account');
   await tx.query('INSERT INTO team_invitations(id,organization_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[uid(),u.organizationId,email,role,hash(token),expires.toISOString(),u.id]);await this.audit.write(tx,u,'TEAM_INVITED','organization',u.organizationId,{email,role,expiresAt:expires.toISOString()});});
  return {inviteToken:token,email,role,expiresAt:expires.toISOString(),notice:'This token is shown once. Deliver privately; public self-selected professional roles remain unapproved.'};
 }
 /** Separately privileged path. Requires a CURRENT admin and a fresh MFA step-up,
  * both checked under row locks in the same transaction as the invite creation.
  */
 async inviteCoAdmin(u:UserAuth,sessionId:string,b:any){
  const email=text(b?.email,'email',200).toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email))throw new BadRequestException('Invalid email');
  const token=randomBytes(32).toString('base64url');
  const expires=new Date(Date.now()+COADMIN_INVITE_TTL_MS);
  await this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,u,sessionId);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${u.organizationId}:co-admin:${email}`]);
   const existing=await tx.query('SELECT 1 FROM users WHERE email=$1',[email]);
   if(existing.rows.length)throw new ConflictException('This email already has an account');
   const pending=await tx.query(`SELECT 1 FROM team_invitations WHERE organization_id=$1 AND lower(email)=$2
      AND role='ORG_ADMIN' AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`,[u.organizationId,email]);
   if(pending.rows.length)throw new ConflictException('An active administrator invitation already exists');
   await tx.query(`INSERT INTO team_invitations(id,organization_id,email,role,token_hash,expires_at,created_by)
     VALUES($1,$2,$3,'ORG_ADMIN',$4,$5,$6)`,[uid(),u.organizationId,email,hash(token),expires.toISOString(),u.id]);
   await this.audit.write(tx,u,'COADMIN_INVITED','organization',u.organizationId,{email,expiresAt:expires.toISOString()});
  });
  return {inviteToken:token,email,role:'ORG_ADMIN',expiresAt:expires.toISOString(),notice:'One-time privileged invitation. Share privately. The new administrator must enroll MFA before workspace access.'};
 }
 async acceptCoAdmin(b:any){
  const token=text(b?.token,'token',200),fullName=text(b?.fullName,'fullName',120),pw=text(b?.password,'password',128);
  try{validateNewPassword(pw)}catch(e:any){throw new BadRequestException(e.message)}
  const pass=await argon2.hash(pw,{type:argon2.argon2id});
  return this.db.transaction(async tx=>{
   const {rows}=await tx.query(`SELECT * FROM team_invitations WHERE token_hash=$1 AND role='ORG_ADMIN' FOR UPDATE`,[hash(token)]);
   const invite=rows[0];
   if(!canAcceptCoAdminInvitation(invite,Date.now()))throw new BadRequestException('Invitation invalid, expired, revoked or already accepted');
   const sponsor=await tx.query(`SELECT u.id FROM users u JOIN auth_mfa_credentials m ON m.user_id=u.id
     WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND m.enabled=true
     FOR SHARE OF u,m`,[invite.created_by,invite.organization_id]);
   if(!sponsor.rows.length)throw new ForbiddenException('Inviting administrator no longer authorized');
   const id=uid();
   try{await tx.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role,professional_approved,admin_mfa_required)
     VALUES($1,$2,$3,$4,$5,'ORG_ADMIN',false,true)`,[id,invite.organization_id,fullName,invite.email,pass]);}
   catch(e:any){if(e?.code==='23505')throw new ConflictException('Email already registered');throw e;}
   await tx.query('UPDATE team_invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1',[invite.id,id]);
   const newUser:UserAuth={id,organizationId:invite.organization_id,fullName,email:invite.email,role:'ORG_ADMIN',professionalApproved:false};
   await this.audit.write(tx,newUser,'COADMIN_INVITE_ACCEPTED','user',id,{invitationId:invite.id,invitedBy:invite.created_by,mfaEnrollmentRequired:true});
   return {ok:true,notice:'Co-administrator account created. Sign in, then enroll and confirm authenticator MFA before accessing any workspace data.'};
  });
 }
 async revokeCoAdminInvitation(u:UserAuth,sessionId:string,id:string){
  await this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,u,sessionId);
   const found=await tx.query(`UPDATE team_invitations SET revoked_at=now()
     WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND accepted_at IS NULL
       AND revoked_at IS NULL RETURNING email`,[isUuid(id),u.organizationId]);
   if(!found.rows.length)throw new NotFoundException('Active co-administrator invitation not found');
   await this.audit.write(tx,u,'COADMIN_INVITATION_REVOKED','organization',u.organizationId,{email:found.rows[0].email,invitationId:id});
  });return {ok:true};
 }
 async coAdminInvitations(u:UserAuth){assertRole(u,['ORG_ADMIN']);
  const {rows}=await this.db.query(`SELECT id,email,expires_at,accepted_at,revoked_at,created_at
    FROM team_invitations WHERE organization_id=$1 AND role='ORG_ADMIN'
    ORDER BY created_at DESC LIMIT 100`,[u.organizationId]);return rows;
 }
 async accept(b:any){const token=text(b?.token,'token',200),fullName=text(b?.fullName,'fullName',120),password=text(b?.password,'password',128);try{validateNewPassword(password)}catch(e:any){throw new BadRequestException(e.message)}const pass=await argon2.hash(password,{type:argon2.argon2id});
  return this.db.transaction(async tx=>{const {rows}=await tx.query("SELECT * FROM team_invitations WHERE token_hash=$1 AND role<>'ORG_ADMIN' AND revoked_at IS NULL FOR UPDATE",[hash(token)]);const invite=rows[0];if(!invite||invite.accepted_at||invitationExpired(new Date(invite.expires_at)))throw new BadRequestException('Invitation invalid, expired or already accepted');
   const id=uid();try{await tx.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role,professional_approved) VALUES($1,$2,$3,$4,$5,$6,false)`,[id,invite.organization_id,fullName,invite.email,pass,invite.role]);}catch(e:any){if(e?.code==='23505')throw new ConflictException('Email already registered');throw e;}
   await tx.query('UPDATE team_invitations SET accepted_at=now() WHERE id=$1',[invite.id]);return {ok:true,notice:'Account created. Sign in to access your assigned organization. Professional accreditation is still subject to independent vetting.'};
  });
 }
}
@Controller('team')class TeamController{
 constructor(private svc:TeamService){}
 @Get('members')@UseGuards(AuthGuard)members(@Req()r:any){return this.svc.list(r.user);}
 @Get('invitations')@UseGuards(AuthGuard)invitations(@Req()r:any){return this.svc.invitations(r.user);}
 @Post('invitations')@UseGuards(AuthGuard)invite(@Req()r:any,@Body()b:any){return this.svc.invite(r.user,b);}
 @Post('co-admin/invitations')@UseGuards(AuthGuard)@Throttle({default:{limit:3,ttl:60000}})
 inviteCoAdmin(@Req()r:any,@Body()b:any){return this.svc.inviteCoAdmin(r.user,r.sessionId,b);}
 @Get('co-admin/invitations')@UseGuards(AuthGuard)listCoAdmin(@Req()r:any){return this.svc.coAdminInvitations(r.user);}
 @Post('co-admin/invitations/:id/revoke')@UseGuards(AuthGuard)@Throttle({default:{limit:3,ttl:60000}})
 revokeCoAdmin(@Req()r:any,@Param('id')id:string){return this.svc.revokeCoAdminInvitation(r.user,r.sessionId,id);}
 @Throttle({default:{limit:5,ttl:60000}})@Post('co-admin/accept')acceptCoAdmin(@Body()b:any){return this.svc.acceptCoAdmin(b);}
 @Throttle({default:{limit:6,ttl:60000}})@Post('accept')accept(@Body()b:any){return this.svc.accept(b);}
}
@Module({imports:[AuthModule,AuditModule],providers:[TeamService],controllers:[TeamController]})export class TeamModule{}
