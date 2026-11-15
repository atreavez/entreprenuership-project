import {Body,Controller,Get,Post,Param,Req,UseGuards,Injectable,Module,BadRequestException,ForbiddenException,ConflictException,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {UserAuth,uid,isUuid} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {validateProviderConfiguration,validateVersion,validateChangeReason,validateChangeDecision,providerDeliveryState,type Channel,type ProviderConfiguration} from '../domain/provider-policy';
const CHANNELS:Channel[]=['EMAIL','SMS'];
function invalid(error:unknown):never{throw new BadRequestException(error instanceof Error?error.message:'Invalid provider configuration')}
function config(input:unknown){try{return validateProviderConfiguration(input)}catch(error){return invalid(error)}}
function expected(input:unknown){try{return validateVersion(input)}catch(error){return invalid(error)}}
function reason(input:unknown){try{return validateChangeReason(input)}catch(error){return invalid(error)}}
function vote(input:unknown){try{return validateChangeDecision(input)}catch(error){return invalid(error)}}
const disabled=(channel:Channel):ProviderConfiguration=>({channel,provider:'NONE',status:'DISABLED',senderLabel:'AssetTrust',credentialRef:null});
@Injectable()
export class ProviderAdminService{
 constructor(private db:Database,private audit:AuditService){}
 private async readAdmin(tx:PoolClient,u:UserAuth,sid:string){
  const {rows}=await tx.query(`SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
   WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
   AND s.id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
   FOR SHARE OF u,s`,[u.id,u.organizationId,sid]);
  if(rows.length!==1)throw new ForbiddenException('Current organization administrator session required');
 }
 async routes(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.readAdmin(tx,actor,sid);
  const {rows}=await tx.query(`SELECT channel,provider,status,sender_label,credential_ref,version,updated_at
   FROM admin_notification_routes WHERE organization_id=$1 ORDER BY channel`,[actor.organizationId]);
  const registered=new Map(rows.map((row:any)=>[row.channel,row]));
  return {routes:CHANNELS.map(channel=>{
   const row:any=registered.get(channel);const value=row?config({channel,provider:row.provider,status:row.status,senderLabel:row.sender_label,credentialRef:row.credential_ref}):disabled(channel);
   return {...value,version:row?Number(row.version):0,updatedAt:row?.updated_at??null,deliveryState:providerDeliveryState(value)};
  }),deliveryNotice:'External SMS/email transport is NOT deployed. STAGED is not LIVE. No external message can be sent by this module.'};
 });}
 async changes(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await this.readAdmin(tx,actor,sid);
  const {rows}=await tx.query(`SELECT id,channel,provider,requested_status AS status,sender_label AS "senderLabel",
    credential_ref AS "credentialRef",expected_version,reason,proposed_by,proposed_at,decided_by,decided_at,
    CASE WHEN decided_by IS NULL THEN 'PENDING' ELSE 'DECIDED' END AS decision_state,
    admin_notification_route_changes.status AS decision
    FROM admin_notification_route_changes WHERE organization_id=$1 ORDER BY proposed_at DESC,id DESC LIMIT 100`,[actor.organizationId]);
  return {changes:rows};
 });}
 async propose(actor:UserAuth,sid:string,input:any){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['channel','provider','status','senderLabel','credentialRef','expectedVersion','reason'].includes(k)))throw new BadRequestException('Unsupported provider setting');
  const p=config({channel:input.channel,provider:input.provider,status:input.status,senderLabel:input.senderLabel,credentialRef:input.credentialRef??null});
  const currentVersion=expected(input.expectedVersion);const why=reason(input.reason);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:provider:${actor.organizationId}:${p.channel}`]);
   const active=await tx.query('SELECT version FROM admin_notification_routes WHERE organization_id=$1 AND channel=$2 FOR UPDATE',[actor.organizationId,p.channel]);
   if(Number(active.rows[0]?.version||0)!==currentVersion)throw new ConflictException('Stale provider version; refresh and retry');
   const pending=await tx.query(`SELECT id FROM admin_notification_route_changes WHERE organization_id=$1 AND channel=$2 AND status='PENDING' FOR UPDATE`,[actor.organizationId,p.channel]);
   if(pending.rows.length)throw new ConflictException('A provider change is already pending independent approval');
   const id=uid();
   await tx.query(`INSERT INTO admin_notification_route_changes
    (id,organization_id,channel,provider,requested_status,sender_label,credential_ref,expected_version,reason,proposed_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,actor.organizationId,p.channel,p.provider,p.status,p.senderLabel,p.credentialRef,currentVersion,why,actor.id]);
   await this.audit.write(tx,actor,'NOTIFICATION_PROVIDER_PROPOSED','provider_configuration',id,{channel:p.channel,expectedVersion:currentVersion,reason:why});
   return {id,status:'PENDING',channel:p.channel,notice:'Not applied. A second administrator must approve with recent MFA. External sending remains disabled.'};
  });
 }
 async decide(actor:UserAuth,sid:string,idInput:string,input:unknown){
  const decision=vote(input),id=isUuid(idInput);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   const initial=await tx.query('SELECT * FROM admin_notification_route_changes WHERE id=$1 AND organization_id=$2',[id,actor.organizationId]);
   let p=initial.rows[0];if(!p||p.status!=='PENDING')throw new NotFoundException('Pending provider change not found');
   if(p.proposed_by===actor.id)throw new ForbiddenException('Self-approval of notification providers is prohibited');
   const proposer=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE`,[p.proposed_by,actor.organizationId]);
   if(proposer.rows.length!==1)throw new ForbiddenException('Proposing administrator is no longer authorized');
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:provider:${actor.organizationId}:${p.channel}`]);
   const locked=await tx.query('SELECT * FROM admin_notification_route_changes WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,actor.organizationId]);
   p=locked.rows[0];if(!p||p.status!=='PENDING')throw new ConflictException('Provider proposal already decided');
   if(p.proposed_by===actor.id)throw new ForbiddenException('Independent administrator approval is required');
   const live=await tx.query('SELECT version FROM admin_notification_routes WHERE organization_id=$1 AND channel=$2 FOR UPDATE',[actor.organizationId,p.channel]);
   const previousVersion=Number(p.expected_version);
   if(Number(live.rows[0]?.version||0)!==previousVersion)throw new ConflictException('Provider configuration changed since proposal');
   const rechecked=config({channel:p.channel,provider:p.provider,status:p.requested_status,senderLabel:p.sender_label,credentialRef:p.credential_ref});
   if(decision==='APPROVE'){
    const result=await tx.query(`INSERT INTO admin_notification_routes(organization_id,channel,provider,status,sender_label,credential_ref,version,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(organization_id,channel) DO UPDATE SET provider=EXCLUDED.provider,status=EXCLUDED.status,
       sender_label=EXCLUDED.sender_label,credential_ref=EXCLUDED.credential_ref,version=EXCLUDED.version,
       updated_by=EXCLUDED.updated_by,updated_at=now()
      WHERE admin_notification_routes.version=$9 RETURNING version`,[actor.organizationId,rechecked.channel,rechecked.provider,rechecked.status,rechecked.senderLabel,rechecked.credentialRef,previousVersion+1,actor.id,previousVersion]);
    if(result.rows.length!==1)throw new ConflictException('Provider update lost concurrent-version check');
   }
   await tx.query('UPDATE admin_notification_route_changes SET status=$3,decided_by=$4,decided_at=now() WHERE id=$1 AND organization_id=$2',[id,actor.organizationId,decision==='APPROVE'?'APPROVED':'REJECTED',actor.id]);
   await this.audit.write(tx,actor,decision==='APPROVE'?'NOTIFICATION_PROVIDER_APPROVED':'NOTIFICATION_PROVIDER_REJECTED','provider_configuration',id,{channel:p.channel,previousVersion,decision});
   return {id,status:decision==='APPROVE'?'APPROVED':'REJECTED',applied:decision==='APPROVE',deliveryState:providerDeliveryState(rechecked),notice:'No outbound SMS or email has been sent.'};
  });
 }
}
@Controller('admin-providers')@UseGuards(AuthGuard)
export class ProviderAdminController{
 constructor(private readonly svc:ProviderAdminService){}
 @Get('routes')routes(@Req()r:any){return this.svc.routes(r.user,r.sessionId)}
 @Get('changes')changes(@Req()r:any){return this.svc.changes(r.user,r.sessionId)}
 @Post('changes')propose(@Req()r:any,@Body()body:any){return this.svc.propose(r.user,r.sessionId,body)}
 @Post('changes/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()body:any){return this.svc.decide(r.user,r.sessionId,id,body?.decision)}
}
@Module({imports:[AuthModule,AuditModule],providers:[ProviderAdminService],controllers:[ProviderAdminController]})
export class ProviderAdminModule{}
