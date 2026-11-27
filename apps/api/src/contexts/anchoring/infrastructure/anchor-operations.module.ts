import {Controller,Get,Req,UseGuards,Injectable,Module,OnApplicationBootstrap,OnModuleDestroy,ForbiddenException} from '@nestjs/common';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import type {UserAuth} from '../../../common';
import {AnchorAdapterRegistry,ApprovedAnchorDispatchGate} from '../application/anchor-dispatch';
import {AnchorWorker} from '../application/anchor-worker';
import {AnchorOrchestrator} from '../application/anchor-orchestrator';
import {ANCHOR_SETTINGS_KEY,parseAnchorSettingsText} from '../domain/anchor-job-policy';
import {PgAnchorJobRepository} from './pg-anchor-job.repository';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
@Injectable()
export class AnchorOperations implements OnApplicationBootstrap,OnModuleDestroy{
 // Deliberately empty in this checkpoint. Concrete adapters must be registered
 // by reviewed deployment composition, never by request data.
 private readonly registry=new AnchorAdapterRegistry();
 private stopped=false;
 private timer:ReturnType<typeof setInterval>|undefined;
 private readonly orchestrator:AnchorOrchestrator;
 constructor(private readonly db:Database){
  const authorized=()=>!this.stopped&&this.registry.size>0&&process.env.NODE_ENV==='production'&&
   process.env.ASSETTRUST_ANCHOR_DISPATCH_AUTHORIZED==='YES'&&process.env.ASSETTRUST_ANCHOR_EMERGENCY_STOP!=='YES';
  const gate=new ApprovedAnchorDispatchGate(this.registry,{authorized,current:async()=>{
   const {rows}=await db.query('SELECT value,version FROM admin_configuration_values WHERE scope=$1 AND scope_id=$2 AND setting_key=$3',
    ['platform',PLATFORM_ID,ANCHOR_SETTINGS_KEY]);
   return rows.length===1?parseAnchorSettingsText(rows[0].value,Number(rows[0].version)):null;
  }});
  const worker=new AnchorWorker(new PgAnchorJobRepository(db),gate);
  const source={nextBatch:async(after:string|null,limit:number)=>{
   const {rows}=await db.query('SELECT id FROM organizations WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT $2',[after,limit]);
   return rows.map(row=>String(row.id));
  }};
  this.orchestrator=new AnchorOrchestrator(worker,source,authorized);
 }
 onApplicationBootstrap(){
  // No worker runs in demo/test or while the registry is empty.
  if(!this.orchestrator.status().enabled)return;
  this.timer=setInterval(()=>{void this.orchestrator.tick();},15000);
  this.timer.unref();
 }
 onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);}
 async status(actor:UserAuth,sid:string){
  return this.db.transaction(async tx=>{
   const active=await tx.query(`SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
    JOIN platform_admin_appointments p ON p.user_id=u.id
    WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
    AND s.id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
    AND p.revoked_at IS NULL FOR SHARE OF u,s,p`,[actor.id,actor.organizationId,sid]);
   if(active.rows.length!==1)throw new ForbiddenException('Current platform administrator session required');
   return {worker:this.orchestrator.status(),registeredAdapters:this.registry.size,
    dispatchState:this.registry.size===0?'NOT_CONNECTED':this.orchestrator.status().enabled?'AUTHORIZED':'SUSPENDED',
    notice:'Worker health is process-local. Dispatch authorization is not evidence of a confirmed transaction.'};
  });
 }
}
@Controller('anchoring/operations')@UseGuards(AuthGuard)
export class AnchorOperationsController{
 constructor(private readonly ops:AnchorOperations){}
 @Get('status')status(@Req()r:any){return this.ops.status(r.user,r.sessionId);}
}
@Module({imports:[AuthModule],providers:[AnchorOperations],controllers:[AnchorOperationsController]})
export class AnchorOperationsModule{}
