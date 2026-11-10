import { Controller, Get, Post, Param, Body, Req, UseGuards, Injectable, Module, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Database } from './database';
import { AuditModule,AuditService } from './audit';
import { AuthGuard,AuthModule } from './auth';
import { uid,text,optionalText,enumValue,UserAuth,assertRole,isUuid } from './common';
import {AccessModule,AccessService} from './access';
import { EvidenceWorkflow, WorkflowFailure } from './contexts/verification/application/evidence-workflow';
import { PostgresWorkflowRepository } from './contexts/verification/infrastructure/postgres-workflow.repository';
import { STAGES as DOMAIN_STAGES } from './contexts/verification/domain/evidence-policy';
import { ForbiddenException } from '@nestjs/common';
export const STAGES=DOMAIN_STAGES;
const EVIDENCE_TYPES=['IDENTITY','DOCUMENT','REGISTRY_SEARCH','FIELD_REPORT','LEGAL_OPINION','DECISION','OTHER'] as const;
export function nextStage(stage:string):string{const i=STAGES.indexOf(stage as any); if(i<0||i===STAGES.length-1)throw new ConflictException('Case is already closed');return STAGES[i+1];}
export function authorizeStage(u:UserAuth,stage:string){
 if(stage==='FIELD_INSPECTION')return assertRole(u,['SURVEYOR'],true);
 if(stage==='LEGAL_REVIEW')return assertRole(u,['LEGAL_REVIEWER'],true);
 if(stage==='FINAL_REVIEW')return assertRole(u,['ORG_ADMIN'],true);
 return assertRole(u,['ORG_ADMIN','REVIEWER']);
}
@Injectable()
export class CasesService{
 constructor(private db:Database,private audit:AuditService,private access:AccessService,private workflow:EvidenceWorkflow){}
 async list(u:UserAuth){const {rows}=await this.db.query(`SELECT c.*, a.asset_code,a.district,a.declared_owner,a.asset_type FROM verification_cases c
    JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
    WHERE c.organization_id=$1 AND ($2::bool OR c.created_by=$3 OR c.assigned_to=$3)
    ORDER BY c.created_at DESC LIMIT 200`,[u.organizationId,u.role==='ORG_ADMIN',u.id]);return rows;}
 async get(u:UserAuth,id:string){
  await this.access.case(u,id);
  const {rows}=await this.db.query(`SELECT c.*,a.asset_code,a.district,a.declared_owner,a.asset_type FROM verification_cases c
    JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
    WHERE c.id=$1 AND c.organization_id=$2`,[isUuid(id),u.organizationId]);
  if(!rows[0])throw new NotFoundException('Case not found');return rows[0];
 }
 async create(u:UserAuth,body:any){assertRole(u,['ORG_ADMIN','CLIENT','REVIEWER']);const assetId=isUuid(body?.assetId);
  await this.access.asset(u,assetId,true);const id=uid(),code=`AT-VC-${id.slice(0,8).toUpperCase()}`;
  await this.db.transaction(async tx=>{
   const a=await tx.query('SELECT id FROM assets WHERE id=$1 AND organization_id=$2',[assetId,u.organizationId]);
   if(!a.rows.length)throw new NotFoundException('Asset not found');
   await tx.query('INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,notes) VALUES ($1,$2,$3,$4,$5,$6)',[id,u.organizationId,code,assetId,u.id,optionalText(body?.notes,'notes',2000)]);
   await tx.query("UPDATE assets SET status='IN_REVIEW',updated_at=now() WHERE id=$1 AND organization_id=$2",[assetId,u.organizationId]);
   await this.audit.write(tx,u,'CASE_CREATED','case',id,{caseCode:code,assetId});
  });return this.get(u,id);
 }
 async evidence(u:UserAuth,id:string,body:any){assertRole(u,['ORG_ADMIN','REVIEWER','SURVEYOR','LEGAL_REVIEWER']);await this.access.case(u,id,true);
  const {rows:[caseRow]}=await this.db.query('SELECT id,stage,assigned_to,status FROM verification_cases WHERE id=$1 AND organization_id=$2',[isUuid(id),u.organizationId]);
  if(caseRow && u.role!=='ORG_ADMIN' && caseRow.assigned_to!==u.id)throw new ConflictException('Only the assigned reviewer or administrator may submit case evidence');
  if(!caseRow)throw new NotFoundException('Case not found');
  if(caseRow.stage==='CLOSED')throw new ConflictException('Closed case cannot accept evidence');
  const open=await this.db.query("SELECT 1 FROM disputes WHERE case_id=$1 AND organization_id=$2 AND status IN ('OPEN','INVESTIGATING') LIMIT 1",[id,u.organizationId]);
  if(open.rows.length)throw new ConflictException('Dispute must be addressed before continuing evidence review');
  const stage=enumValue(body?.stage,STAGES.slice(0,-1),'stage');
  if(stage!==caseRow.stage)throw new BadRequestException('Evidence can only be submitted for the current stage');
  authorizeStage(u,stage);
  const type=enumValue(body?.evidenceType,EVIDENCE_TYPES,'evidenceType');
  const source=text(body?.sourceName,'sourceName',200),notes=text(body?.observations,'observations',2000),reference=optionalText(body?.reference,'reference',200);
  if(['REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW'].includes(stage) && !reference)throw new BadRequestException('An attributable evidence reference is required at this stage');
  const evId=uid();await this.db.transaction(async tx=>{
    const locked=await tx.query('SELECT stage,status FROM verification_cases WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,u.organizationId]);
    if(!locked.rows[0]||locked.rows[0].stage!==stage||locked.rows[0].status!=='OPEN')throw new ConflictException('Case stage changed or case is not open; reload and retry');
    const unresolved=await tx.query("SELECT 1 FROM disputes WHERE case_id=$1 AND organization_id=$2 AND status IN ('OPEN','INVESTIGATING') LIMIT 1",[id,u.organizationId]);
    if(unresolved.rows.length)throw new ConflictException('Active dispute prevents adding evidence');
    await tx.query(`INSERT INTO case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,reference,observations,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[evId,u.organizationId,id,stage,type,source,reference,notes,u.id]);
    await this.audit.write(tx,u,'EVIDENCE_ADDED','case',id,{evidenceId:evId,stage,type,source});
  });return {id:evId,stage,evidenceType:type,sourceName:source,observations:notes,reviewStatus:'SUBMITTED'};
 }
 async listEvidence(u:UserAuth,id:string){await this.get(u,id);const {rows}=await this.db.query('SELECT id,stage,evidence_type,source_name,reference,observations,recorded_by,review_status,reviewed_by,reviewed_at,review_notes,created_at FROM case_evidence WHERE case_id=$1 AND organization_id=$2 ORDER BY created_at DESC',[id,u.organizationId]);return rows;}
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
  async assign(u:UserAuth,id:string,assigneeId:string){assertRole(u,['ORG_ADMIN']);const caseId=isUuid(id);await this.access.orgUser(u,assigneeId);await this.db.transaction(async tx=>{const result=await tx.query('UPDATE verification_cases SET assigned_to=$1,updated_at=now() WHERE id=$2 AND organization_id=$3 RETURNING id',[assigneeId,caseId,u.organizationId]);if(!result.rows.length)throw new NotFoundException('Case not found');await tx.query(`INSERT INTO notifications(id,organization_id,recipient_id,category,title,body,resource_type,resource_id)
 VALUES($1,$2,$3,'CASE','Verification case assigned','A verification case has been assigned to you','case',$4)`,[uid(),u.organizationId,assigneeId,caseId]);await this.audit.write(tx,u,'CASE_ASSIGNED','case',caseId,{assigneeId});});return this.get(u,caseId);}
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
@Module({imports:[AuthModule,AuditModule,AccessModule],providers:[
 PostgresWorkflowRepository,
 {provide:EvidenceWorkflow,useFactory:(repo:PostgresWorkflowRepository)=>new EvidenceWorkflow(repo),inject:[PostgresWorkflowRepository]},
 CasesService],controllers:[CasesController],exports:[CasesService]})export class CasesModule{}
