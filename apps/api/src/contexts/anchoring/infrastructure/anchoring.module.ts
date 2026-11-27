import {Body,Controller,Get,Post,Param,Req,UseGuards,Injectable,Module,BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {UserAuth,isUuid,uid} from '../../../common';
import {readLocalAuditProof} from '../../../integrations';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {requireCurrentOrganizationAdmin} from '../../access/infrastructure/transactional-access';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {ANCHOR_SETTINGS_KEY,parseAnchorSettingsText,createJob} from '../domain/anchor-job-policy';
import {PgAnchorJobRepository,hydrateAnchorJob} from './pg-anchor-job.repository';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
@Injectable()
export class AnchoringAdminService{
 private readonly jobs:PgAnchorJobRepository;
 constructor(private readonly db:Database,private readonly audit:AuditService){this.jobs=new PgAnchorJobRepository(db);}
 async request(actor:UserAuth,sid:string,input:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||
   typeof (input as any).expectedProof!=='string'||!/^[0-9a-f]{64}$/.test((input as any).expectedProof))
   throw new BadRequestException('Provide only expectedProof from the local audit commitment');
  const expectedProof=(input as {expectedProof:string}).expectedProof;
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   const live=await tx.query('SELECT value,version FROM admin_configuration_values WHERE scope=$1 AND scope_id=$2 AND setting_key=$3 FOR SHARE',
    ['platform',PLATFORM_ID,ANCHOR_SETTINGS_KEY]);
   if(live.rows.length!==1)throw new ConflictException('Platform anchoring policy has not been approved');
   let settings;
   try{settings=parseAnchorSettingsText(live.rows[0].value,Number(live.rows[0].version));}catch{throw new ConflictException('Approved anchoring policy is invalid');}
   if(!settings.enabled)throw new ConflictException('Anchoring requests are disabled');
   // Serialize with all other audit writers; the head remains stable until request audit is appended.
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.organizationId]);
   const proof=await readLocalAuditProof(tx,actor.organizationId);
   if(proof.proof!==expectedProof){
    // A committed request appends an audit event, changing the current proof.
    // Replay may retrieve only an already existing job in this tenant and target.
    const existing=await tx.query('SELECT * FROM public.anchor_jobs WHERE organization_id=$1 AND provider_id=$2 AND network_id=$3 AND commitment=$4',
     [actor.organizationId,settings.target.providerId,settings.target.networkId,expectedProof]);
    if(existing.rows.length===1)return {job:hydrateAnchorJob(existing.rows[0]),created:false,dispatchState:'NOT_CONNECTED'};
    throw new ConflictException('Audit commitment changed; refresh local proof');
   }
   if(proof.head==='GENESIS')throw new ConflictException('No audit events to anchor');
   const job=createJob(uid(),actor.organizationId,proof.proof,settings,Date.now());
   const result=await this.jobs.createOrGetInTransaction(tx,job);
   if(result.created)await this.audit.write(tx,actor,'ANCHOR_JOB_REQUESTED','anchor_job',result.job.id,
    {commitment:result.job.commitment,settingsVersion:settings.version,providerId:settings.target.providerId,networkId:settings.target.networkId});
   return {...result,dispatchState:'NOT_CONNECTED',notice:'Request stored only. No blockchain transaction submitted.'};
  });
 }
 async list(actor:UserAuth){
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await requireCurrentOrganizationAdmin(tx,actor);
   const {rows}=await tx.query('SELECT * FROM public.anchor_jobs WHERE organization_id=$1 ORDER BY id DESC LIMIT 100',[actor.organizationId]);
   return {jobs:rows.map(hydrateAnchorJob),dispatchState:'NOT_CONNECTED'};
  });
 }
 async history(actor:UserAuth,id:string){
  const jobId=isUuid(id);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await requireCurrentOrganizationAdmin(tx,actor);
   const found=await tx.query('SELECT id FROM public.anchor_jobs WHERE organization_id=$1 AND id=$2',[actor.organizationId,jobId]);
   if(found.rows.length!==1)throw new NotFoundException('Anchoring job not found');
   const {rows}=await tx.query('SELECT revision,snapshot,recorded_at FROM public.anchor_job_history WHERE organization_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 100',[actor.organizationId,jobId]);
   return {history:rows,dispatchState:'NOT_CONNECTED'};
  });
 }
}
@Controller('anchoring')@UseGuards(AuthGuard)
export class AnchoringController{
 constructor(private readonly svc:AnchoringAdminService){}
 @Post('jobs')request(@Req()r:any,@Body()body:unknown){return this.svc.request(r.user,r.sessionId,body);}
 @Get('jobs')list(@Req()r:any){return this.svc.list(r.user);}
 @Get('jobs/:id/history')history(@Req()r:any,@Param('id')id:string){return this.svc.history(r.user,id);}
}
@Module({imports:[AuthModule,AuditModule],providers:[AnchoringAdminService],controllers:[AnchoringController]})
export class AnchoringModule{}
