import {Controller,Get,Post,Req,Param,Body,UseGuards,Injectable,Module,BadRequestException,NotFoundException,ConflictException} from '@nestjs/common';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {isUuid,type UserAuth} from '../../../common';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {assertCurrentAdminSession,assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {PgReconciliationJobs,requireReconciliationSchema,hydrateReconciliationJob} from './pg-reconciliation-jobs';
@Injectable()
export class ReconciliationAdminService{
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 async list(actor:UserAuth,sid:string){
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);await assertCurrentAdminSession(tx,actor,sid);await requireReconciliationSchema(tx);
   const {rows}=await tx.query('SELECT * FROM public.billing_reconciliation_jobs WHERE organization_id=$1 ORDER BY next_run_at NULLS LAST,id LIMIT 100',[actor.organizationId]);
   return {jobs:rows.map(hydrateReconciliationJob),dispatchState:'NOT_CONNECTED'};
  });
 }
 async history(actor:UserAuth,sid:string,id:string){
  const jobId=isUuid(id);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);await assertCurrentAdminSession(tx,actor,sid);await requireReconciliationSchema(tx);
   const found=await tx.query('SELECT id FROM public.billing_reconciliation_jobs WHERE organization_id=$1 AND id=$2',[actor.organizationId,jobId]);
   if(found.rows.length!==1)throw new NotFoundException('Reconciliation job not found');
   const {rows}=await tx.query('SELECT revision,snapshot,recorded_at FROM public.billing_reconciliation_history WHERE organization_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 100',[actor.organizationId,jobId]);
   return {history:rows,dispatchState:'NOT_CONNECTED'};
  });
 }
 async recover(actor:UserAuth,sid:string,id:string,body:any){
  const jobId=isUuid(id);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==2||!Object.hasOwn(body,'expectedRevision')||!Object.hasOwn(body,'reason')||
   !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.reason!=='string'||body.reason.trim().length<12||body.reason.length>500)
   throw new BadRequestException('Provide expectedRevision and a recovery reason (12–500 characters)');
  // Check live MFA before revealing even the availability of a job.
  await this.db.transaction(async tx=>{await setTenantScope(tx,actor.organizationId);await assertCurrentAdminStepUp(tx,actor,sid);});
  // Repository repeats the current MFA check in the actual write transaction.
  // No client-supplied provider, transaction identifier, policy or paid flag.
  const repository=new PgReconciliationJobs(this.db);
  try{
   const job=await repository.recover(actor,sid,jobId,body.expectedRevision,body.reason,this.audit);
   return {job,dispatchState:'NOT_CONNECTED',notice:'Requeued only. No payment verified or collected.'};
  }catch(e){
   // Preserve Nest authorization and service errors. Do not expose SQL or
   // indicate whether a foreign job exists.
   if(e&&typeof e==='object'&&'getStatus' in e)throw e;
   throw new ConflictException('Reconciliation job unavailable for recovery; refresh and check current approved policy');
  }
 }
}
@Controller('billing/reconciliation')@UseGuards(AuthGuard)
export class ReconciliationAdminController{
 constructor(private readonly svc:ReconciliationAdminService){}
 @Get('jobs')list(@Req()r:any){return this.svc.list(r.user,r.sessionId);}
 @Get('jobs/:id/history')history(@Req()r:any,@Param('id')id:string){return this.svc.history(r.user,r.sessionId,id);}
 @Post('jobs/:id/recover')recover(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.recover(r.user,r.sessionId,id,b);}
}
@Module({imports:[AuthModule,AuditModule],providers:[ReconciliationAdminService],controllers:[ReconciliationAdminController]})
export class ReconciliationAdminModule{}
