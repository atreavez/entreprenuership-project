import {Body,Controller,Get,Post,Param,Query,Req,UseGuards,Injectable,Module,BadRequestException,ForbiddenException,ConflictException,NotFoundException} from '@nestjs/common';
import {PoolClient} from 'pg';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {UserAuth,uid,isUuid} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {catalog,prepareChange,assertExpectedVersion,assertScope,assertDecision,type ConfigScope} from '../domain/configuration-policy';

const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
function inputError(e:unknown):never{throw new BadRequestException(e instanceof Error?e.message:'Invalid configuration');}
function scopeFromQuery(value:unknown):ConfigScope{try{return assertScope(value)}catch(e){return inputError(e)}}
function validateKeyValue(scope:ConfigScope,key:unknown,value:unknown){try{return prepareChange(scope,key,value)}catch(e){return inputError(e)}}
function versionOf(input:unknown){try{return assertExpectedVersion(input)}catch(e){return inputError(e)}}
function decisionOf(input:unknown){try{return assertDecision(input)}catch(e){return inputError(e)}}

@Injectable()
export class AdminControlService{
 constructor(private db:Database,private audit:AuditService){}
 private async currentAdmin(tx:PoolClient,u:UserAuth,sid:string,scope:ConfigScope,write:boolean){
  // Never trust role/appointment data from a JWT or previously cached request principal.
  if(write)await assertCurrentAdminStepUp(tx,u,sid);
  else {
   const role=await tx.query(`SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
      WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL AND s.id=$3 AND s.revoked_at IS NULL
        AND s.expires_at>now() AND s.absolute_expires_at>now() FOR SHARE OF u,s`,[u.id,u.organizationId,sid]);
   if(role.rows.length!==1)throw new ForbiddenException('Current organization administrator session required');
  }
  if(scope==='platform'){
   const appt=await tx.query(`SELECT user_id FROM platform_admin_appointments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE`,[u.id]);
   if(appt.rows.length!==1)throw new ForbiddenException('Platform administrator appointment required');
  }
 }
 private scopeId(u:UserAuth,scope:ConfigScope){return scope==='platform'?PLATFORM_ID:u.organizationId;}
 async whoami(u:UserAuth,sid:string){
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,u,sid,'organization',false);
   const {rows}=await tx.query('SELECT user_id FROM platform_admin_appointments WHERE user_id=$1 AND revoked_at IS NULL',[u.id]);
   return {organizationId:u.organizationId,canOrganizationAdmin:true,canPlatformAdmin:rows.length===1};
  });
 }
 async definitions(u:UserAuth,sid:string,scope:ConfigScope){
  await this.db.transaction(tx=>this.currentAdmin(tx,u,sid,scope,false));
  return {scope,items:catalog(scope)};
 }
 async values(u:UserAuth,sid:string,scope:ConfigScope){
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,u,sid,scope,false);
   const {rows}=await tx.query(`SELECT setting_key AS key,value,version,updated_at FROM admin_configuration_values
      WHERE scope=$1 AND scope_id=$2 ORDER BY setting_key`,[scope,this.scopeId(u,scope)]);
   return {scope,values:rows};
  });
 }
 async history(u:UserAuth,sid:string,scope:ConfigScope){
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,u,sid,scope,false);
   const {rows}=await tx.query(`SELECT id,setting_key AS key,proposed_value,expected_version,status,submitted_by,
      submitted_at,reviewed_by,reviewed_at FROM admin_configuration_changes
      WHERE scope=$1 AND scope_id=$2 ORDER BY submitted_at DESC,id DESC LIMIT 100`,[scope,this.scopeId(u,scope)]);
   return {scope,changes:rows};
  });
 }
 async organizations(u:UserAuth,sid:string){
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,u,sid,'platform',false);
   const {rows}=await tx.query('SELECT id,name,created_at FROM organizations ORDER BY created_at DESC LIMIT 100');
   return {organizations:rows,notice:'Organization metadata only. Tenant records remain inaccessible through this endpoint.'};
  });
 }
 async propose(u:UserAuth,sid:string,body:any){
  const scope=scopeFromQuery(body?.scope);
  const {definition,value,requiresApproval}=validateKeyValue(scope,body?.key,body?.value);
  const expected=versionOf(body?.expectedVersion);
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,u,sid,scope,true);
   const scopeId=this.scopeId(u,scope);
   // Advisory lock covers version=0 as no database row exists to FOR UPDATE.
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:admin:${scope}:${scopeId}:${definition.key}`]);
   const current=await tx.query('SELECT version FROM admin_configuration_values WHERE scope=$1 AND scope_id=$2 AND setting_key=$3 FOR UPDATE',[scope,scopeId,definition.key]);
   if(Number(current.rows[0]?.version||0)!==expected)throw new ConflictException('Stale settings version: refresh and retry');
   const pending=await tx.query(`SELECT id FROM admin_configuration_changes WHERE scope=$1 AND scope_id=$2 AND setting_key=$3 AND status='PENDING' FOR UPDATE`,[scope,scopeId,definition.key]);
   if(pending.rows.length)throw new ConflictException('A change is already awaiting independent approval');
   const id=uid(),status=requiresApproval?'PENDING':'APPROVED';
   await tx.query(`INSERT INTO admin_configuration_changes(id,scope,scope_id,setting_key,proposed_value,expected_version,status,submitted_by,reviewed_by,reviewed_at)
     VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,[id,scope,scopeId,definition.key,JSON.stringify(value),expected,status,u.id,requiresApproval?null:u.id,requiresApproval?null:new Date()]);
   if(!requiresApproval)await this.apply(tx,scope,scopeId,definition.key,value,expected,u.id);
   await this.audit.write(tx,u,requiresApproval?'ADMIN_SETTING_PROPOSED':'ADMIN_SETTING_APPLIED','configuration',id,{scope,key:definition.key,expectedVersion:expected,requiresApproval});
   return {id,status,scope,key:definition.key,version:requiresApproval?expected:expected+1,notice:requiresApproval?'Awaiting an independent administrator with recent MFA. No setting has been applied.':'Change applied and audited.'};
  });
 }
 private async apply(tx:PoolClient,scope:ConfigScope,scopeId:string,key:string,value:unknown,expected:number,actorId:string){
  const result=await tx.query(`INSERT INTO admin_configuration_values(scope,scope_id,setting_key,value,version,updated_by)
     VALUES($1,$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT(scope,scope_id,setting_key) DO UPDATE SET value=EXCLUDED.value,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now()
       WHERE admin_configuration_values.version=$7 RETURNING version`,[scope,scopeId,key,JSON.stringify(value),expected+1,actorId,expected]);
  if(result.rows.length!==1)throw new ConflictException('Setting was modified concurrently; refresh before retry');
 }
 async decide(u:UserAuth,sid:string,id:string,decisionInput:unknown){
  const decision=decisionOf(decisionInput);
  return this.db.transaction(async tx=>{
   const proposal=await tx.query('SELECT * FROM admin_configuration_changes WHERE id=$1',[isUuid(id)]);
   let change=proposal.rows[0];
   // Do not reveal whether an inaccessible proposal exists.
   if(!change||change.status!=='PENDING')throw new NotFoundException('Pending change not found');
   const scope=scopeFromQuery(change.scope);
   if(scope==='organization' && change.scope_id!==u.organizationId)throw new NotFoundException('Pending change not found');
   await this.currentAdmin(tx,u,sid,scope,true);
   if(change.submitted_by===u.id)throw new ForbiddenException('You cannot approve or reject your own high-impact change');
   const origin=await tx.query(`SELECT u.id FROM users u WHERE u.id=$1 AND u.role='ORG_ADMIN'
      AND ($2='platform' OR u.organization_id=$3) AND u.suspended_at IS NULL FOR SHARE OF u`,[change.submitted_by,scope,change.scope_id]);
   if(!origin.rows.length)throw new ForbiddenException('Original administrator is no longer authorized');
   if(scope==='platform'){
    const stillAppointed=await tx.query('SELECT 1 FROM platform_admin_appointments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE',[change.submitted_by]);
    if(!stillAppointed.rows.length)throw new ForbiddenException('Proposing platform administrator is no longer appointed');
   }
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:admin:${scope}:${change.scope_id}:${change.setting_key}`]);
   // Lock ordering matches propose(): advisory lock -> proposal row -> config value.
   // Locking the proposal first here could deadlock with a concurrent proposal.
   const locked=await tx.query('SELECT * FROM admin_configuration_changes WHERE id=$1 FOR UPDATE',[id]);
   change=locked.rows[0];
   if(!change||change.status!=='PENDING')throw new NotFoundException('Pending change not found');
   const live=await tx.query('SELECT version FROM admin_configuration_values WHERE scope=$1 AND scope_id=$2 AND setting_key=$3 FOR UPDATE',[scope,change.scope_id,change.setting_key]);
   if(Number(live.rows[0]?.version||0)!==Number(change.expected_version))throw new ConflictException('Stale proposal; setting changed since submission');
   // Revalidate using the current allowlist to prevent policy evolution from bypassing validation.
   const validated=validateKeyValue(scope,change.setting_key,change.proposed_value);
   if(!validated.requiresApproval)throw new ForbiddenException('This proposal is not an independently reviewable setting');
   if(decision==='APPROVE')await this.apply(tx,scope,change.scope_id,change.setting_key,validated.value,Number(change.expected_version),u.id);
   await tx.query('UPDATE admin_configuration_changes SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1',[id,decision==='APPROVE'?'APPROVED':'REJECTED',u.id]);
   await this.audit.write(tx,u,decision==='APPROVE'?'ADMIN_SETTING_APPROVED':'ADMIN_SETTING_REJECTED','configuration',id,{scope,key:change.setting_key,fromVersion:change.expected_version});
   return {id,status:decision==='APPROVE'?'APPROVED':'REJECTED',applied:decision==='APPROVE'};
  });
 }
}
@Controller('admin-control')@UseGuards(AuthGuard)
export class AdminControlController{
 constructor(private svc:AdminControlService){}
 @Get('me')me(@Req()r:any){return this.svc.whoami(r.user,r.sessionId)}
 @Get('catalog')catalog(@Req()r:any,@Query('scope')scope:string){return this.svc.definitions(r.user,r.sessionId,scopeFromQuery(scope))}
 @Get('settings')settings(@Req()r:any,@Query('scope')scope:string){return this.svc.values(r.user,r.sessionId,scopeFromQuery(scope))}
 @Get('changes')history(@Req()r:any,@Query('scope')scope:string){return this.svc.history(r.user,r.sessionId,scopeFromQuery(scope))}
 @Get('organizations')organizations(@Req()r:any){return this.svc.organizations(r.user,r.sessionId)}
 @Post('changes')propose(@Req()r:any,@Body()b:any){return this.svc.propose(r.user,r.sessionId,b)}
 @Post('changes/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.decide(r.user,r.sessionId,id,b?.decision)}
}
@Module({imports:[AuthModule,AuditModule],providers:[AdminControlService],controllers:[AdminControlController]})
export class AdminControlModule{}
