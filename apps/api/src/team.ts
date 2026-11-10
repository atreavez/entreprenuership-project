import { Body,Controller,Get,Post,Req,UseGuards,Injectable,Module,BadRequestException,ConflictException,NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { validateNewPassword } from './contexts/identity/domain/identity-policy';
import { Throttle } from '@nestjs/throttler';
import argon2 from 'argon2';
import { Database } from './database';
import { AuthGuard,AuthModule } from './auth';
import { AuditModule,AuditService } from './audit';
import { UserAuth, assertRole,hash,uid,text,enumValue } from './common';
const INVITE_ROLES=['CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'] as const;
export function invitationExpired(expiry:Date,now=Date.now()){return !Number.isFinite(expiry.getTime()) || expiry.getTime()<=now;}
@Injectable()
class TeamService{
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
 async accept(b:any){const token=text(b?.token,'token',200),fullName=text(b?.fullName,'fullName',120),password=text(b?.password,'password',128);try{validateNewPassword(password)}catch(e:any){throw new BadRequestException(e.message)}const pass=await argon2.hash(password,{type:argon2.argon2id});
  return this.db.transaction(async tx=>{const {rows}=await tx.query('SELECT * FROM team_invitations WHERE token_hash=$1 FOR UPDATE',[hash(token)]);const invite=rows[0];if(!invite||invite.accepted_at||invitationExpired(new Date(invite.expires_at)))throw new BadRequestException('Invitation invalid, expired or already accepted');
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
 @Throttle({default:{limit:6,ttl:60000}})@Post('accept')accept(@Body()b:any){return this.svc.accept(b);}
}
@Module({imports:[AuthModule,AuditModule],providers:[TeamService],controllers:[TeamController]})export class TeamModule{}
