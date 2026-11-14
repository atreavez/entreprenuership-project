import { Controller, Get, Post, Param, Body, Req, UseGuards, Injectable, Module, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Database } from './database';
import {setTenantScope} from './contexts/tenant-isolation/application/tenant-scope';
import { AuditModule,AuditService } from './audit';
import { AuthGuard,AuthModule } from './auth';
import { uid,text,optionalText,enumValue,UserAuth,assertRole,isUuid } from './common';
import {AccessModule,AccessService} from './access';
import {PublishedContentModule,PublishedContentService} from './contexts/content-publishing/infrastructure/published-content.module';
import { EvidenceWorkflow, WorkflowFailure } from './contexts/verification/application/evidence-workflow';
import { PostgresWorkflowRepository } from './contexts/verification/infrastructure/postgres-workflow.repository';
import { STAGES as DOMAIN_STAGES } from './contexts/verification/domain/evidence-policy';
import { ForbiddenException } from '@nestjs/common';
import {requireCurrentAssetContribution,requireCurrentCaseRead} from './contexts/access/infrastructure/transactional-access';
import {requireCurrentEvidenceSubmission} from './contexts/verification/infrastructure/current-evidence-authorizer';
import {requireCurrentCaseAssignment} from './contexts/verification/infrastructure/current-case-assignment';
export const STAGES=DOMAIN_STAGES;
const EVIDENCE_TYPES=['IDENTITY','DOCUMENT','REGISTRY_SEARCH','FIELD_REPORT','LEGAL_OPINION','DECISION','OTHER'] as const;
export function nextStage(stage:string):string{const i=STAGES.indexOf(stage as any); if(i<0||i===STAGES.length-1)throw new ConflictException('Case is already closed');return STAGES[i+1];}
export function authorizeStage(u:UserAuth,stage:string){
 if(stage==='FIELD_INSPECTION')return assertRole(u,['SURVEYOR'],true);
 if(stage==='LEGAL_REVIEW')return assertRole(u,['LEGAL_REVIEWER'],true);
 if(stage==='FINAL_REVIEW')return assertRole(u,['ORG_ADMIN']);
 return assertRole(u,['ORG_ADMIN','REVIEWER']);
}
@Injectable()
export class CasesService{
 constructor(private db:Database,private audit:AuditService,private access:AccessService,private workflow:EvidenceWorkflow,private published:PublishedContentService){}
 async list(u:UserAuth){const {rows}=await this.db.tenantQuery(u.organizationId,`SELECT c.*, a.asset_code,a.district,a.declared_owner,a.asset_type FROM verification_cases c
    JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
    JOIN users actor ON actor.id=$2 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
    WHERE c.organization_id=$1 AND (actor.role='ORG_ADMIN' OR c.created_by=actor.id OR c.assigned_to=actor.id)
    ORDER BY c.created_at DESC LIMIT 200`,[u.organizationId,u.id]);return rows;}
 async get(u:UserAuth,id:string){
  const caseId=isUuid(id);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await requireCurrentCaseRead(tx,u,caseId);
   const {rows}=await tx.query(`SELECT c.*,a.asset_code,a.district,a.declared_owner,a.asset_type FROM verification_cases c
    JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
    WHERE c.id=$1 AND c.organization_id=$2`,[caseId,u.organizationId]);
   if(!rows[0])throw new NotFoundException('Case not found');return rows[0];
  });
 }
 async create(u:UserAuth,body:any){assertRole(u,['ORG_ADMIN','CLIENT','REVIEWER']);const assetId=isUuid(body?.assetId);
  await this.access.asset(u,assetId,true);const id=uid(),code=`AT-VC-${id.slice(0,8).toUpperCase()}`;
  await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   // The request-time access check is not authoritative: recheck and lock the
   // current contributor permission in this transaction before creating a case.
   await requireCurrentAssetContribution(tx,u,assetId,{allowedActorRoles:['ORG_ADMIN','CLIENT','REVIEWER']});
   await tx.query('INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,notes) VALUES ($1,$2,$3,$4,$5,$6)',[id,u.organizationId,code,assetId,u.id,optionalText(body?.notes,'notes',2000)]);
   await tx.query("UPDATE assets SET status='IN_REVIEW',updated_at=now() WHERE id=$1 AND organization_id=$2",[assetId,u.organizationId]);
   await this.audit.write(tx,u,'CASE_CREATED','case',id,{caseCode:code,assetId});
  });return this.get(u,id);
 }
 async evidence(u:UserAuth,id:string,body:any){
  // Early access check improves UX; the transactional check below is authoritative.
  assertRole(u,['ORG_ADMIN','REVIEWER','SURVEYOR','LEGAL_REVIEWER']);
  const caseId=isUuid(id);
  await this.access.case(u,caseId,true);
  const stage=enumValue(body?.stage,STAGES.slice(0,-1),'stage');
  const type=enumValue(body?.evidenceType,EVIDENCE_TYPES,'evidenceType');
  const source=text(body?.sourceName,'sourceName',200),notes=text(body?.observations,'observations',2000),reference=optionalText(body?.reference,'reference',200);
  if(['REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW'].includes(stage) && !reference)throw new BadRequestException('An attributable evidence reference is required at this stage');
  const evId=uid();await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
    // Lock current assignment, role, organization membership and accreditation.
    // Request-time identity claims can be stale after administrative changes.
    await requireCurrentEvidenceSubmission(tx,u,caseId,stage);
    const unresolved=await tx.query("SELECT 1 FROM disputes WHERE case_id=$1 AND organization_id=$2 AND status IN ('OPEN','INVESTIGATING') LIMIT 1",[caseId,u.organizationId]);
    if(unresolved.rows.length)throw new ConflictException('Active dispute prevents adding evidence');
    await tx.query(`INSERT INTO case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,reference,observations,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[evId,u.organizationId,caseId,stage,type,source,reference,notes,u.id]);
    await this.audit.write(tx,u,'EVIDENCE_ADDED','case',caseId,{evidenceId:evId,stage,type,source});
  });return {id:evId,stage,evidenceType:type,sourceName:source,observations:notes,reviewStatus:'SUBMITTED'};
 }
 async listEvidence(u:UserAuth,id:string){const caseId=isUuid(id);return this.db.transaction(async tx=>{
  await setTenantScope(tx,u.organizationId);
  // Case participation is revalidated and locked in this same transaction.
  // A general asset READ grant must not expose confidential case evidence.
  await requireCurrentCaseRead(tx,u,caseId);
  const {rows}=await tx.query('SELECT id,stage,evidence_type,source_name,reference,observations,recorded_by,review_status,reviewed_by,reviewed_at,review_notes,created_at FROM case_evidence WHERE case_id=$1 AND organization_id=$2 ORDER BY created_at DESC',[caseId,u.organizationId]);return rows;
 });}
 private translate(error:unknown):never{
  if(error instanceof WorkflowFailure){
   if(['CASE_NOT_FOUND','EVIDENCE_NOT_FOUND'].includes(error.code))throw new NotFoundException(error.message);
   if(['INVALID_DECISION','INVALID_NOTES'].includes(error.code))throw new BadRequestException(error.message);
   if(['REVIEW_NOT_AUTHORIZED','STAGE_PERMISSION_DENIED'].includes(error.code))throw new ForbiddenException(error.message);
   throw new ConflictException(error.message);
  }
  throw error;
 }
 async reviewEvidence(u:UserAuth,id:string,evidenceId:string,body:any){
  const caseId=isUuid(id),eid=isUuid(evidenceId);
  await this.access.case(u,caseId,true);
  const decision=enumValue(body?.decision,['ACCEPTED','REJECTED'] as const,'decision');
  const notes=text(body?.reviewNotes,'reviewNotes',2000);
  try{return await this.workflow.review(u,caseId,eid,decision,notes);}
  catch(error){return this.translate(error);}
 }
 async readiness(u:UserAuth,id:string){
  const caseId=isUuid(id);await this.access.case(u,caseId);
  try{return await this.workflow.readiness(u,caseId);}
  catch(error){return this.translate(error);}
 }
 async advance(u:UserAuth,id:string){
  const caseId=isUuid(id);await this.access.case(u,caseId,true);
  try{await this.workflow.advance(u,caseId);return this.get(u,caseId);}
  catch(error){return this.translate(error);}
 }
  async assign(u:UserAuth,id:string,assigneeId:string){
   assertRole(u,['ORG_ADMIN']);
   const caseId=isUuid(id),targetId=isUuid(assigneeId);
   // Outside-transaction role checks are UX only, not authorization authority.
   await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
    await requireCurrentCaseAssignment(tx,u,caseId,targetId);
    const result=await tx.query(`UPDATE verification_cases SET assigned_to=$1,updated_at=now()
      WHERE id=$2 AND organization_id=$3 AND status='OPEN' RETURNING id`,[targetId,caseId,u.organizationId]);
    if(!result.rows.length)throw new NotFoundException('Open case not found');
    // Determine the recipient and case reference from CURRENT tenant-scoped SQL,
    // never from request bodies. Only approved published content is used.
    const detail=await tx.query(`SELECT c.case_code,recipient.full_name AS recipient_name,o.name AS organization_name
      FROM verification_cases c JOIN users recipient ON recipient.id=$1 AND recipient.organization_id=c.organization_id
      JOIN organizations o ON o.id=c.organization_id WHERE c.id=$2 AND c.organization_id=$3 AND recipient.suspended_at IS NULL`,[targetId,caseId,u.organizationId]);
    if(detail.rows.length!==1)throw new ForbiddenException('Active organization recipient required');
    const copy=await this.published.organization(tx,u.organizationId,'notification.case_assigned',{
      case_reference:detail.rows[0].case_code,recipient_name:detail.rows[0].recipient_name,organization_name:detail.rows[0].organization_name});
    await tx.query(`INSERT INTO notifications(id,organization_id,recipient_id,category,title,body,resource_type,resource_id)
      VALUES($1,$2,$3,'CASE','Verification case assigned',$4,'case',$5)`,[uid(),u.organizationId,targetId,copy.text,caseId]);
    await this.audit.write(tx,u,'CASE_ASSIGNED','case',caseId,{assigneeId:targetId});
   });
   return this.get(u,caseId);
  }
}
@Controller('cases')@UseGuards(AuthGuard)
export class CasesController{
 constructor(private svc:CasesService){}
 @Get()list(@Req()r:any){return this.svc.list(r.user);}
 @Get(':id')get(@Req()r:any,@Param('id')id:string){return this.svc.get(r.user,id);}
 @Post()create(@Req()r:any,@Body()b:any){return this.svc.create(r.user,b);}
 @Get(':id/readiness')readiness(@Req()r:any,@Param('id')id:string){return this.svc.readiness(r.user,id);}
 @Get(':id/evidence')evidences(@Req()r:any,@Param('id')id:string){return this.svc.listEvidence(r.user,id);}
 @Post(':id/evidence')evidence(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.evidence(r.user,id,b);}
 @Post(':id/evidence/:evidenceId/review')review(@Req()r:any,@Param('id')id:string,@Param('evidenceId')evidenceId:string,@Body()b:any){return this.svc.reviewEvidence(r.user,id,evidenceId,b);}
 @Post(':id/advance')advance(@Req()r:any,@Param('id')id:string){return this.svc.advance(r.user,id);}
 @Post(':id/assign')assign(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.assign(r.user,id,isUuid(b?.assigneeId));}
}
@Module({imports:[AuthModule,AuditModule,AccessModule,PublishedContentModule],providers:[
 PostgresWorkflowRepository,
 {provide:EvidenceWorkflow,useFactory:(repo:PostgresWorkflowRepository)=>new EvidenceWorkflow(repo),inject:[PostgresWorkflowRepository]},
 CasesService],controllers:[CasesController],exports:[CasesService]})export class CasesModule{}
