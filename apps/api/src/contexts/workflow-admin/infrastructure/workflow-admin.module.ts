import {Body,Controller,Get,Post,Param,Req,UseGuards,Injectable,Module,BadRequestException,ForbiddenException,ConflictException,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {UserAuth,uid,isUuid} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {STAGE_REQUIRED_EVIDENCE} from '../../verification/domain/evidence-policy';
import {editableStages,eligibleAdditionalEvidence,prepareWorkflowPolicy,assertPolicyVersion,defaultWorkflowPolicy} from '../domain/workflow-policy';

function bad(e:unknown):never{throw new BadRequestException(e instanceof Error?e.message:'Invalid workflow input');}
function getPolicy(stage:unknown,body:unknown){try{return prepareWorkflowPolicy(stage,body)}catch(e){return bad(e)}}
function getExpected(value:unknown){try{return assertPolicyVersion(value)}catch(e){return bad(e)}}
function getReason(value:unknown){if(typeof value!=='string'||value.trim().length<12||value.length>500)return bad(Error('A reason of 12–500 characters is required'));return value.trim();}
function getDecision(value:unknown):'APPROVE'|'REJECT'{if(value!=='APPROVE'&&value!=='REJECT')return bad(Error('Invalid review decision'));return value;}
@Injectable()
export class WorkflowAdminService{
 constructor(private db:Database,private audit:AuditService){}
 private async readAdmin(tx:PoolClient,actor:UserAuth,sid:string){
  const {rows}=await tx.query(`SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
    WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
     AND s.id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
    FOR SHARE OF u,s`,[actor.id,actor.organizationId,sid]);
  if(rows.length!==1)throw new ForbiddenException('Active organization administrator session required');
 }
 async stages(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.readAdmin(tx,actor,sid);
  const {rows}=await tx.query(`SELECT stage,target_days,reminder_days,additional_evidence_type,version,updated_at
    FROM workflow_stage_policies WHERE organization_id=$1 ORDER BY stage`,[actor.organizationId]);
  const byStage=new Map(rows.map(r=>[r.stage,r]));
  return {stages:editableStages.map(stage=>{
   const row=byStage.get(stage);const d=defaultWorkflowPolicy(stage);
   return {stage,requiredEvidence:STAGE_REQUIRED_EVIDENCE[stage],targetDays:row?.target_days??d.targetDays,
    reminderDays:row?.reminder_days??d.reminderDays,additionalEvidenceType:row?.additional_evidence_type??null,
    version:row?.version??0,updatedAt:row?.updated_at??null,eligibleExtraEvidence:eligibleAdditionalEvidence.filter(x=>x!==STAGE_REQUIRED_EVIDENCE[stage])};
  }),notice:'Core verification stages, mandatory evidence and independent-review requirements cannot be weakened by administrators.'};
 });}
 async changes(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.readAdmin(tx,actor,sid);
  const {rows}=await tx.query(`SELECT id,stage,target_days,reminder_days,additional_evidence_type,expected_version,reason,status,proposed_by,decided_by,proposed_at,decided_at
     FROM workflow_stage_policy_changes WHERE organization_id=$1 ORDER BY proposed_at DESC,id DESC LIMIT 100`,[actor.organizationId]);
  return {changes:rows};
 });}
 async propose(actor:UserAuth,sid:string,body:any){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['stage','targetDays','reminderDays','additionalEvidenceType','expectedVersion','reason'].includes(k)))throw new BadRequestException('Unsupported workflow configuration field');
  const p=getPolicy(body?.stage,{targetDays:body?.targetDays,reminderDays:body?.reminderDays,additionalEvidenceType:body?.additionalEvidenceType});
  const expected=getExpected(body?.expectedVersion),reason=getReason(body?.reason);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:workflow:${actor.organizationId}:${p.stage}`]);
   const current=await tx.query('SELECT version FROM workflow_stage_policies WHERE organization_id=$1 AND stage=$2 FOR UPDATE',[actor.organizationId,p.stage]);
   if(Number(current.rows[0]?.version||0)!==expected)throw new ConflictException('Stale workflow revision; reload settings');
   const pending=await tx.query(`SELECT id FROM workflow_stage_policy_changes WHERE organization_id=$1 AND stage=$2 AND status='PENDING' FOR UPDATE`,[actor.organizationId,p.stage]);
   if(pending.rows.length)throw new ConflictException('A workflow change is already awaiting approval');
   const id=uid();
   await tx.query(`INSERT INTO workflow_stage_policy_changes(id,organization_id,stage,target_days,reminder_days,additional_evidence_type,expected_version,reason,proposed_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,actor.organizationId,p.stage,p.targetDays,p.reminderDays,p.additionalEvidenceType,expected,reason,actor.id]);
   await this.audit.write(tx,actor,'WORKFLOW_POLICY_PROPOSED','workflow_policy',id,{stage:p.stage,expectedVersion:expected,reason});
   return {id,status:'PENDING',stage:p.stage,notice:'No workflow rule has changed. A different active administrator must approve with recent MFA.'};
  });
 }
 async decide(actor:UserAuth,sid:string,id:string,decisionInput:unknown){
  const decision=getDecision(decisionInput);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   // Tenant-filtered lookup prevents guessing another organization's proposal.
   const initial=await tx.query('SELECT * FROM workflow_stage_policy_changes WHERE id=$1 AND organization_id=$2',[isUuid(id),actor.organizationId]);
   let proposal=initial.rows[0];
   if(!proposal||proposal.status!=='PENDING')throw new NotFoundException('Pending workflow proposal not found');
   if(proposal.proposed_by===actor.id)throw new ForbiddenException('Independent administrator approval is required');
   const proposer=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE`,[proposal.proposed_by,actor.organizationId]);
   if(proposer.rows.length!==1)throw new ForbiddenException('The proposer is no longer an active administrator');
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:workflow:${actor.organizationId}:${proposal.stage}`]);
   const locked=await tx.query('SELECT * FROM workflow_stage_policy_changes WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,actor.organizationId]);
   proposal=locked.rows[0];
   if(!proposal||proposal.status!=='PENDING')throw new ConflictException('Workflow proposal was already decided');
   if(proposal.proposed_by===actor.id)throw new ForbiddenException('Independent administrator approval is required');
   const current=await tx.query('SELECT version FROM workflow_stage_policies WHERE organization_id=$1 AND stage=$2 FOR UPDATE',[actor.organizationId,proposal.stage]);
   const expected=Number(proposal.expected_version);
   if(Number(current.rows[0]?.version||0)!==expected)throw new ConflictException('Workflow policy changed since proposal');
   // Revalidate against the CURRENT domain allowlist before applying, never trust persisted proposal content blindly.
   const p=getPolicy(proposal.stage,{targetDays:proposal.target_days,reminderDays:proposal.reminder_days,additionalEvidenceType:proposal.additional_evidence_type});
   if(decision==='APPROVE'){
    const updated=await tx.query(`INSERT INTO workflow_stage_policies(organization_id,stage,target_days,reminder_days,additional_evidence_type,version,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(organization_id,stage) DO UPDATE SET target_days=EXCLUDED.target_days,reminder_days=EXCLUDED.reminder_days,
        additional_evidence_type=EXCLUDED.additional_evidence_type,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now()
       WHERE workflow_stage_policies.version=$8 RETURNING version`,[actor.organizationId,p.stage,p.targetDays,p.reminderDays,p.additionalEvidenceType,expected+1,actor.id,expected]);
    if(updated.rows.length!==1)throw new ConflictException('Concurrent workflow change prevented');
   }
   await tx.query(`UPDATE workflow_stage_policy_changes SET status=$3,decided_by=$4,decided_at=now() WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId,decision==='APPROVE'?'APPROVED':'REJECTED',actor.id]);
   await this.audit.write(tx,actor,decision==='APPROVE'?'WORKFLOW_POLICY_APPROVED':'WORKFLOW_POLICY_REJECTED','workflow_policy',id,{stage:p.stage,version:expected+1,decision});
   return {id,status:decision==='APPROVE'?'APPROVED':'REJECTED',applied:decision==='APPROVE'};
  });
 }
}
@Controller('admin-workflows')@UseGuards(AuthGuard)
export class WorkflowAdminController{
 constructor(private svc:WorkflowAdminService){}
 @Get('stages')stages(@Req()r:any){return this.svc.stages(r.user,r.sessionId);}
 @Get('changes')changes(@Req()r:any){return this.svc.changes(r.user,r.sessionId);}
 @Post('changes')propose(@Req()r:any,@Body()b:any){return this.svc.propose(r.user,r.sessionId,b);}
 @Post('changes/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.decide(r.user,r.sessionId,id,b?.decision);}
}
@Module({imports:[AuthModule,AuditModule],providers:[WorkflowAdminService],controllers:[WorkflowAdminController]})
export class WorkflowAdminModule{}
