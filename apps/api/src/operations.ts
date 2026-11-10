import {Body,Controller,Get,Post,Patch,Param,Req,UseGuards,Injectable,Module,NotFoundException,BadRequestException,ConflictException} from '@nestjs/common';
import {Database} from './database';
import {AuditModule,AuditService} from './audit';
import {AuthModule,AuthGuard} from './auth';
import {AccessModule,AccessService} from './access';
import {uid,isUuid,text,optionalText,enumValue,UserAuth,assertRole} from './common';
const TASK_STATUS=['TODO','IN_PROGRESS','DONE','CANCELLED'] as const;
const DISPUTE_TYPES=['IDENTITY','DOCUMENT','BOUNDARY','OWNERSHIP_CLAIM','REGISTRY_CONFLICT','OTHER'] as const;
const DISPUTE_STATUS=['OPEN','INVESTIGATING','RESOLVED','REJECTED'] as const;
const QUOTE_STATUS=['DRAFT','ISSUED','ACCEPTED','DECLINED','VOID'] as const;
export function validDueDate(value:unknown){const d=new Date(value as string);if(!Number.isFinite(d.getTime()))throw new BadRequestException('Invalid date');return d.toISOString();}
@Injectable()
class OperationsService {
 constructor(private db:Database,private audit:AuditService,private access:AccessService){}
 async tasks(u:UserAuth,caseId?:string){if(caseId)await this.access.case(u,caseId);const {rows}=await this.db.query(`SELECT t.* FROM case_tasks t JOIN verification_cases c ON c.id=t.case_id AND c.organization_id=t.organization_id
    JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
    WHERE t.organization_id=$1 AND ($3::uuid IS NULL OR t.case_id=$3) AND ($4::bool OR t.created_by=$2 OR t.assignee_id=$2 OR c.created_by=$2 OR c.assigned_to=$2 OR a.created_by=$2)
    ORDER BY t.created_at DESC LIMIT 200`,[u.organizationId,u.id,caseId||null,u.role==='ORG_ADMIN']);return rows;}
 async createTask(u:UserAuth,b:any){assertRole(u,['ORG_ADMIN','REVIEWER','SURVEYOR','LEGAL_REVIEWER']);const caseId=isUuid(b?.caseId);await this.access.case(u,caseId,true);
  const title=text(b?.title,'title',180),desc=optionalText(b?.description,'description',2000),due=b?.dueAt?validDueDate(b.dueAt):null,assignee=b?.assigneeId?isUuid(b.assigneeId):null;
  if(assignee)await this.access.orgUser(u,assignee);const id=uid();await this.db.transaction(async tx=>{await tx.query(`INSERT INTO case_tasks(id,organization_id,case_id,title,description,assignee_id,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,u.organizationId,caseId,title,desc,assignee,due,u.id]);if(assignee && assignee!==u.id)await tx.query(`INSERT INTO notifications(id,organization_id,recipient_id,category,title,body,resource_type,resource_id)
 VALUES($1,$2,$3,'TASK','New case task assigned',$4,'case',$5)`,[uid(),u.organizationId,assignee,title,caseId]);await this.audit.write(tx,u,'TASK_CREATED','case',caseId,{taskId:id,title,assigneeId:assignee});});return {id,caseId,title,status:'TODO'};}
 async updateTask(u:UserAuth,id:string,b:any){const status=enumValue(b?.status,TASK_STATUS,'task status');const taskId=isUuid(id);return this.db.transaction(async tx=>{const {rows}=await tx.query(`SELECT t.* FROM case_tasks t WHERE t.id=$1 AND t.organization_id=$2 FOR UPDATE`,[taskId,u.organizationId]);const task=rows[0];if(!task)throw new NotFoundException('Task not found');if(u.role!=='ORG_ADMIN'&&task.assignee_id!==u.id&&task.created_by!==u.id)throw new ConflictException('Task not assigned to you');await tx.query('UPDATE case_tasks SET status=$1,updated_at=now() WHERE id=$2',[status,taskId]);await this.audit.write(tx,u,'TASK_STATUS_CHANGED','task',taskId,{from:task.status,to:status});return {id:taskId,status};});}
 async disputes(u:UserAuth){const {rows}=await this.db.query(`SELECT d.*,c.case_code,a.asset_code FROM disputes d JOIN verification_cases c ON c.id=d.case_id AND c.organization_id=d.organization_id
  JOIN assets a ON a.id=c.asset_id WHERE d.organization_id=$1 AND ($3::bool OR d.reported_by=$2 OR c.created_by=$2 OR c.assigned_to=$2 OR a.created_by=$2)
  ORDER BY d.created_at DESC LIMIT 200`,[u.organizationId,u.id,u.role==='ORG_ADMIN']);return rows;}
 async raiseDispute(u:UserAuth,b:any){const caseId=isUuid(b?.caseId);await this.access.case(u,caseId);const category=enumValue(b?.category,DISPUTE_TYPES,'category'),description=text(b?.description,'description',3000);const id=uid();await this.db.transaction(async tx=>{
  await tx.query('INSERT INTO disputes(id,organization_id,case_id,category,description,reported_by) VALUES($1,$2,$3,$4,$5,$6)',[id,u.organizationId,caseId,category,description,u.id]);
  await tx.query("UPDATE verification_cases SET status='BLOCKED',updated_at=now() WHERE id=$1 AND organization_id=$2 AND status<>'CLOSED'",[caseId,u.organizationId]);
  await tx.query("UPDATE assets SET status='FLAGGED',updated_at=now() WHERE id=(SELECT asset_id FROM verification_cases WHERE id=$1 AND organization_id=$2) AND organization_id=$2",[caseId,u.organizationId]);
  const admins=await tx.query("SELECT id FROM users WHERE organization_id=$1 AND role='ORG_ADMIN'",[u.organizationId]);for(const admin of admins.rows)await tx.query(`INSERT INTO notifications(id,organization_id,recipient_id,category,title,body,resource_type,resource_id)
 VALUES($1,$2,$3,'DISPUTE','Verification concern reported',$4,'case',$5)`,[uid(),u.organizationId,admin.id,category+' concern needs investigation',caseId]);
  await this.audit.write(tx,u,'DISPUTE_REPORTED','case',caseId,{disputeId:id,category});
 });return {id,caseId,status:'OPEN',notice:'Disputed case flagged. This is a privately reported concern; not a legal adjudication.'};}
 async resolveDispute(u:UserAuth,id:string,b:any){assertRole(u,['ORG_ADMIN']);const status=enumValue(b?.status,DISPUTE_STATUS,'status');if(!['RESOLVED','REJECTED','INVESTIGATING'].includes(status))throw new BadRequestException('Invalid resolution status');const resolution=text(b?.resolution,'resolution',3000);
  return this.db.transaction(async tx=>{const {rows}=await tx.query('SELECT * FROM disputes WHERE id=$1 AND organization_id=$2 FOR UPDATE',[isUuid(id),u.organizationId]);const d=rows[0];if(!d)throw new NotFoundException('Dispute not found');if(['RESOLVED','REJECTED'].includes(d.status))throw new ConflictException('Dispute is already final');
   await tx.query('UPDATE disputes SET status=$1,resolution=$2,resolved_by=$3,updated_at=now() WHERE id=$4',[status,resolution,u.id,id]);
   const open=await tx.query("SELECT count(*)::int n FROM disputes WHERE case_id=$1 AND organization_id=$2 AND status IN ('OPEN','INVESTIGATING')",[d.case_id,u.organizationId]);
   if(open.rows[0].n===0){await tx.query("UPDATE verification_cases SET status='OPEN',updated_at=now() WHERE id=$1 AND organization_id=$2 AND status='BLOCKED'",[d.case_id,u.organizationId]);await tx.query("UPDATE assets SET status='IN_REVIEW',updated_at=now() WHERE id=(SELECT asset_id FROM verification_cases WHERE id=$1 AND organization_id=$2 AND stage<>'CLOSED') AND organization_id=$2 AND status='FLAGGED'",[d.case_id,u.organizationId]);}
   await this.audit.write(tx,u,'DISPUTE_UPDATED','dispute',id,{from:d.status,to:status,resolution});return {id,status};
  });
 }
 async reminders(u:UserAuth){const {rows}=await this.db.query(`SELECT m.*,a.asset_code,a.district FROM monitoring_reminders m JOIN assets a ON a.id=m.asset_id AND a.organization_id=m.organization_id WHERE m.organization_id=$1 AND ($3::bool OR m.created_by=$2 OR a.created_by=$2) ORDER BY m.due_at ASC LIMIT 200`,[u.organizationId,u.id,u.role==='ORG_ADMIN']);return rows;}
 async createReminder(u:UserAuth,b:any){const assetId=isUuid(b?.assetId);await this.access.asset(u,assetId);const label=text(b?.label,'label',180),due=validDueDate(b?.dueAt);if(new Date(due).getTime()<=Date.now())throw new BadRequestException('Reminder date must be in future');const id=uid();await this.db.transaction(async tx=>{await tx.query('INSERT INTO monitoring_reminders(id,organization_id,asset_id,label,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,u.organizationId,assetId,label,due,u.id]);await this.audit.write(tx,u,'REMINDER_CREATED','asset',assetId,{reminderId:id,dueAt:due});});return {id,assetId,label,dueAt:due};}
 async quotes(u:UserAuth){assertRole(u,['ORG_ADMIN','REVIEWER']);const {rows}=await this.db.query(`SELECT q.*,c.case_code FROM verification_quotes q JOIN verification_cases c ON c.id=q.case_id WHERE q.organization_id=$1 ORDER BY q.created_at DESC LIMIT 100`,[u.organizationId]);return rows;}
 async createQuote(u:UserAuth,b:any){assertRole(u,['ORG_ADMIN']);const caseId=isUuid(b?.caseId);await this.access.case(u,caseId);const amount=Number(b?.amountUgx);if(!Number.isSafeInteger(amount)||amount<0||amount>1_000_000_000)throw new BadRequestException('Invalid UGX amount');const scope=text(b?.scope,'scope',2000),id=uid();await this.db.transaction(async tx=>{await tx.query('INSERT INTO verification_quotes(id,organization_id,case_id,amount_ugx,scope,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,u.organizationId,caseId,amount,scope,u.id]);await this.audit.write(tx,u,'QUOTE_CREATED','case',caseId,{quoteId:id,amountUgx:amount});});return {id,caseId,amountUgx:amount,status:'DRAFT',notice:'Quote only. No invoice or payment has been collected.'};}
 async updateQuote(u:UserAuth,id:string,b:any){assertRole(u,['ORG_ADMIN']);const status=enumValue(b?.status,QUOTE_STATUS,'status');return this.db.transaction(async tx=>{const {rows}=await tx.query('SELECT * FROM verification_quotes WHERE id=$1 AND organization_id=$2 FOR UPDATE',[isUuid(id),u.organizationId]);const q=rows[0];if(!q)throw new NotFoundException('Quote not found');if(!((q.status==='DRAFT' && ['ISSUED','VOID'].includes(status)) || (q.status==='ISSUED' && status==='VOID')))throw new ConflictException('Only DRAFT to ISSUED/VOID or ISSUED to VOID are available; customer acceptance requires a separate authenticated flow');await tx.query('UPDATE verification_quotes SET status=$1 WHERE id=$2',[status,id]);await this.audit.write(tx,u,'QUOTE_STATUS_CHANGED','quote',id,{from:q.status,to:status});return {id,status};});}
}
@Controller('operations')@UseGuards(AuthGuard)
class OperationsController{
 constructor(private svc:OperationsService){}
 @Get('tasks') tasks(@Req()r:any){return this.svc.tasks(r.user);}
 @Get('cases/:id/tasks') caseTasks(@Req()r:any,@Param('id')id:string){return this.svc.tasks(r.user,id);}
 @Post('tasks') task(@Req()r:any,@Body()b:any){return this.svc.createTask(r.user,b);}
 @Patch('tasks/:id') updateTask(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.updateTask(r.user,id,b);}
 @Get('disputes') disputes(@Req()r:any){return this.svc.disputes(r.user);}
 @Post('disputes') dispute(@Req()r:any,@Body()b:any){return this.svc.raiseDispute(r.user,b);}
 @Patch('disputes/:id') resolve(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.resolveDispute(r.user,id,b);}
 @Get('reminders') reminders(@Req()r:any){return this.svc.reminders(r.user);}
 @Post('reminders') reminder(@Req()r:any,@Body()b:any){return this.svc.createReminder(r.user,b);}
 @Get('quotes') quotes(@Req()r:any){return this.svc.quotes(r.user);}
 @Post('quotes') quote(@Req()r:any,@Body()b:any){return this.svc.createQuote(r.user,b);}
 @Patch('quotes/:id') updateQuote(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.updateQuote(r.user,id,b);}
}
@Module({imports:[AuthModule,AuditModule,AccessModule],providers:[OperationsService],controllers:[OperationsController]})export class OperationsModule{}
