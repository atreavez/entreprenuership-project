import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {Body,Controller,Get,Post,Param,Req,UseGuards,Injectable,Module,BadRequestException,ForbiddenException,ConflictException,NotFoundException} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {UserAuth,uid,isUuid} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {ROLE_CATALOG,assertNonAdminRole,assertDecision,assertReason,assertTargetRoleChange,assertMemberStateChange} from '../domain/member-policy';

function invalid(error:unknown):never{throw new BadRequestException(error instanceof Error?error.message:'Invalid member operation');}
function reasonOf(value:unknown):string{try{return assertReason(value);}catch(e){return invalid(e);}}
function roleOf(value:unknown){try{return assertNonAdminRole(value);}catch(e){return invalid(e);}}
function choice(value:unknown){try{return assertDecision(value);}catch(e){return invalid(e);}}
function isTargetRole(actorId:string,target:any,role:unknown){try{return assertTargetRoleChange(actorId,target,role);}catch(e){return invalid(e);}}
function isTargetAction(actorId:string,target:any,action:unknown){try{return assertMemberStateChange(actorId,target,action);}catch(e){return invalid(e);}}

@Injectable()
export class MemberManagementService {
 constructor(private db:Database,private audit:AuditService){}
 private async assertReadAdmin(tx:PoolClient,actor:UserAuth,sid:string){
  const {rows}=await tx.query(`SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
   WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
     AND s.id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
   FOR SHARE OF u,s`,[actor.id,actor.organizationId,sid]);
  if(rows.length!==1)throw new ForbiddenException('Current organization administrator session required');
 }
 private async target(tx:PoolClient,actor:UserAuth,id:string){
  // Tenant-scoped query is the sole way to obtain a user for mutation.
  const {rows}=await tx.query(`SELECT id,organization_id,role,suspended_at FROM users
    WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[isUuid(id),actor.organizationId]);
  if(rows.length!==1)throw new NotFoundException('Organization member not found');
  return rows[0];
 }
 async catalog(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.assertReadAdmin(tx,actor,sid);
  return {roles:ROLE_CATALOG,policy:'Role permissions are enforced by application code. Custom permission grants are not yet supported; administrator and professional access require independent vetting.'};
 });}
 async list(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.assertReadAdmin(tx,actor,sid);
  const {rows}=await tx.query(`SELECT u.id,u.full_name,u.email,u.role,u.created_at,u.suspended_at,
    EXISTS (SELECT 1 FROM professional_accreditations p WHERE p.user_id=u.id AND p.professional_role=u.role
      AND p.revoked_at IS NULL AND p.expires_at>now()) AS professional_approved
    FROM users u WHERE u.organization_id=$1 ORDER BY u.created_at DESC,u.id LIMIT 200`,[actor.organizationId]);
  return {members:rows,notice:'Current organization only; excludes passwords, MFA secrets, refresh tokens and private evidence.'};
 });}
 async proposals(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.assertReadAdmin(tx,actor,sid);
  const {rows}=await tx.query(`SELECT p.id,p.target_user_id,p.expected_role,p.proposed_role,p.reason,p.status,
    p.proposed_by,p.decided_by,p.proposed_at,p.decided_at,u.full_name AS target_name,u.email AS target_email
    FROM member_role_proposals p JOIN users u ON u.id=p.target_user_id AND u.organization_id=p.organization_id
    WHERE p.organization_id=$1 ORDER BY p.proposed_at DESC,p.id DESC LIMIT 100`,[actor.organizationId]);
  return {changes:rows};
 });}
 async proposeRole(actor:UserAuth,sid:string,id:string,body:any){
  const desired=roleOf(body?.role),reason=reasonOf(body?.reason);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   const subject=await this.target(tx,actor,id);
   isTargetRole(actor.id,subject,desired);
   const {rows}=await tx.query(`SELECT id FROM member_role_proposals WHERE organization_id=$1 AND target_user_id=$2
     AND status='PENDING' FOR UPDATE`,[actor.organizationId,subject.id]);
   if(rows.length)throw new ConflictException('This member already has a pending role proposal');
   const proposalId=uid();
   await tx.query(`INSERT INTO member_role_proposals
     (id,organization_id,target_user_id,expected_role,proposed_role,reason,proposed_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[proposalId,actor.organizationId,subject.id,subject.role,desired,reason,actor.id]);
   await this.audit.write(tx,actor,'MEMBER_ROLE_PROPOSED','user',subject.id,{proposalId,from:subject.role,to:desired,reason});
   return {id:proposalId,status:'PENDING',notice:'Awaiting a different current administrator with recent MFA. The member role has not changed.'};
  });
 }
 async decideRole(actor:UserAuth,sid:string,proposalId:string,input:unknown){
  const decision=choice(input);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   // Read scoped metadata before locking the user; consistent lock order avoids request/approval deadlocks.
   const pending=await tx.query(`SELECT * FROM member_role_proposals WHERE id=$1 AND organization_id=$2`,[isUuid(proposalId),actor.organizationId]);
   const candidate=pending.rows[0];
   if(!candidate||candidate.status!=='PENDING')throw new NotFoundException('Pending role change not found');
   if(candidate.proposed_by===actor.id)throw new ForbiddenException('The proposing administrator cannot approve or reject their own proposal');
   const subject=await this.target(tx,actor,candidate.target_user_id);
   const locked=await tx.query(`SELECT * FROM member_role_proposals WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[proposalId,actor.organizationId]);
   const change=locked.rows[0];
   if(!change||change.status!=='PENDING')throw new ConflictException('Proposal was already decided');
   if(change.proposed_by===actor.id)throw new ForbiddenException('Independent administrator required');
   if(change.target_user_id!==subject.id)throw new ConflictException('Member proposal changed unexpectedly');
   const proposer=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN'
     AND suspended_at IS NULL FOR SHARE`,[change.proposed_by,actor.organizationId]);
   if(!proposer.rows.length)throw new ForbiddenException('Original proposing administrator is no longer authorized');
   if(subject.role!==change.expected_role)throw new ConflictException('Member role changed since the proposal was created');
   isTargetRole(change.proposed_by,subject,change.proposed_role);
   if(decision==='APPROVE'){
    // Changing a specialist role must not reactivate old professional accreditation.
    await tx.query(`UPDATE professional_accreditations SET revoked_at=now(),revocation_reason='Role changed: new vetting required'
      WHERE user_id=$1 AND revoked_at IS NULL`,[subject.id]);
    const update=await tx.query(`UPDATE users SET role=$3,professional_approved=false WHERE id=$1 AND organization_id=$2
      AND role=$4 AND suspended_at IS NULL RETURNING id`,[subject.id,actor.organizationId,roleOf(change.proposed_role),change.expected_role]);
    if(update.rows.length!==1)throw new ConflictException('Member changed concurrently');
    await tx.query(`UPDATE verification_cases SET assigned_to=NULL,updated_at=now()
      WHERE organization_id=$1 AND assigned_to=$2 AND stage<>'CLOSED'`,[actor.organizationId,subject.id]);
    await tx.query(`UPDATE auth_sessions SET revoked_at=now(),revocation_reason='MEMBER_ROLE_CHANGED'
      WHERE user_id=$1 AND revoked_at IS NULL`,[subject.id]);
   }
   const status=decision==='APPROVE'?'APPROVED':'REJECTED';
   await tx.query(`UPDATE member_role_proposals SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1`,[proposalId,status,actor.id]);
   await this.audit.write(tx,actor,decision==='APPROVE'?'MEMBER_ROLE_APPROVED':'MEMBER_ROLE_REJECTED','user',subject.id,
     {proposalId,from:change.expected_role,to:change.proposed_role,reason:change.reason,professionalVettingRequired:true});
   return {ok:true,status,notice:decision==='APPROVE'?'Role updated, previous sessions revoked and open case assignments cleared. Professional status requires new vetting.':'Proposal rejected and audited.'};
  });
 }
 async changeStatus(actor:UserAuth,sid:string,id:string,body:any){
  const action=body?.action,reason=reasonOf(body?.reason);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   const subject=await this.target(tx,actor,id);
   isTargetAction(actor.id,subject,action);
   if(action==='SUSPEND'){
    await tx.query(`UPDATE users SET suspended_at=now(),suspended_by=$3,suspension_reason=$4
      WHERE id=$1 AND organization_id=$2`,[subject.id,actor.organizationId,actor.id,reason]);
    await tx.query(`UPDATE auth_sessions SET revoked_at=now(),revocation_reason='ACCOUNT_SUSPENDED'
      WHERE user_id=$1 AND revoked_at IS NULL`,[subject.id]);
    await tx.query(`UPDATE member_role_proposals SET status='CANCELLED',decided_by=$2,decided_at=now()
      WHERE organization_id=$1 AND target_user_id=$3 AND status='PENDING'`,[actor.organizationId,actor.id,subject.id]);
   }else{
    // Restoring an account never restores sessions, role proposals or professional credentials.
    await tx.query(`UPDATE users SET suspended_at=NULL,suspended_by=NULL,suspension_reason=NULL
      WHERE id=$1 AND organization_id=$2`,[subject.id,actor.organizationId]);
   }
   await this.audit.write(tx,actor,action==='SUSPEND'?'MEMBER_SUSPENDED':'MEMBER_RESTORED','user',subject.id,{reason});
   return {ok:true,status:action==='SUSPEND'?'SUSPENDED':'ACTIVE',notice:action==='SUSPEND'?'Account suspended; sessions revoked and pending role requests cancelled.':'Account restored; member must sign in again.'};
  });
 }
}
@Controller('admin-members')
class MemberManagementController{
 constructor(private readonly service:MemberManagementService){}
 @Get('catalog')@UseGuards(AuthGuard)catalog(@Req()r:any){return this.service.catalog(r.user,r.sessionId);}
 @Get('members')@UseGuards(AuthGuard)members(@Req()r:any){return this.service.list(r.user,r.sessionId);}
 @Get('role-changes')@UseGuards(AuthGuard)changes(@Req()r:any){return this.service.proposals(r.user,r.sessionId);}
 @Post('members/:id/role-changes')@UseGuards(AuthGuard)@Throttle({default:{limit:8,ttl:60000}})
 propose(@Req()r:any,@Param('id')id:string,@Body()body:any){return this.service.proposeRole(r.user,r.sessionId,id,body);}
 @Post('role-changes/:id/decision')@UseGuards(AuthGuard)@Throttle({default:{limit:8,ttl:60000}})
 decide(@Req()r:any,@Param('id')id:string,@Body()body:any){return this.service.decideRole(r.user,r.sessionId,id,body?.decision);}
 @Post('members/:id/status')@UseGuards(AuthGuard)@Throttle({default:{limit:8,ttl:60000}})
 status(@Req()r:any,@Param('id')id:string,@Body()body:any){return this.service.changeStatus(r.user,r.sessionId,id,body);}
}
@Module({imports:[AuthModule,AuditModule],providers:[MemberManagementService],controllers:[MemberManagementController]})
export class MemberManagementModule{}
