import {Body,Controller,Get,Post,Param,Query,Req,UseGuards,Injectable,Module,BadRequestException,ForbiddenException,ConflictException,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {UserAuth,uid,isUuid} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {assertScope,definitionFor,catalog,prepareTemplate,assertRevision,assertReason,assertDecision,renderPlainText,NON_OFFICIAL_NOTICE,type TemplateScope} from '../domain/template-policy';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
function bad(e:unknown):never{throw new BadRequestException(e instanceof Error?e.message:'Invalid content template');}
function scopeOf(x:unknown):TemplateScope{try{return assertScope(x)}catch(e){return bad(e)}}
function candidate(scope:TemplateScope,key:unknown,text:unknown){try{return prepareTemplate(scope,key,text)}catch(e){return bad(e)}}
function revision(x:unknown){try{return assertRevision(x)}catch(e){return bad(e)}}
function reason(x:unknown){try{return assertReason(x)}catch(e){return bad(e)}}
function decision(x:unknown){try{return assertDecision(x)}catch(e){return bad(e)}}
@Injectable()
export class ContentAdminService {
 constructor(private db:Database,private audit:AuditService){}
 private scopeId(actor:UserAuth,scope:TemplateScope){return scope==='platform'?PLATFORM_ID:actor.organizationId;}
 private async currentAdmin(tx:PoolClient,actor:UserAuth,sid:string,scope:TemplateScope,write:boolean){
  if(write) await assertCurrentAdminStepUp(tx,actor,sid);
  else {
   const {rows}=await tx.query(`SELECT u.id FROM users u JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
     WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
      AND s.id=$3 AND s.revoked_at IS NULL AND s.expires_at>now() AND s.absolute_expires_at>now()
     FOR SHARE OF u,s`,[actor.id,actor.organizationId,sid]);
   if(rows.length!==1)throw new ForbiddenException('Active organization administrator session required');
  }
  if(scope==='platform'){
   const {rows}=await tx.query('SELECT user_id FROM platform_admin_appointments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE',[actor.id]);
   if(rows.length!==1)throw new ForbiddenException('Current platform administrator appointment required');
  }
 }
 async templates(actor:UserAuth,sid:string,scope:TemplateScope){return this.db.transaction(async tx=>{
  await this.currentAdmin(tx,actor,sid,scope,false);
  const {rows}=await tx.query(`SELECT template_key AS key,body,revision,updated_at FROM admin_content_templates WHERE scope=$1 AND scope_id=$2 ORDER BY template_key`,[scope,this.scopeId(actor,scope)]);
  const current=new Map(rows.map((r:any)=>[r.key,r]));
  return {scope,templates:catalog(scope).map(d=>({definition:d,key:d.key,body:current.get(d.key)?.body??d.defaultBody,revision:Number(current.get(d.key)?.revision||0),updatedAt:current.get(d.key)?.updated_at||null})),notice:'Only published, approved revisions are treated as active. Report legal notice is immutable.'};
 });}
 async history(actor:UserAuth,sid:string,scope:TemplateScope){return this.db.transaction(async tx=>{
  await this.currentAdmin(tx,actor,sid,scope,false);
  const {rows}=await tx.query(`SELECT id,template_key AS key,proposed_body AS body,expected_revision,reason,status,submitted_by,submitted_at,reviewed_by,reviewed_at
    FROM admin_content_proposals WHERE scope=$1 AND scope_id=$2 ORDER BY submitted_at DESC,id DESC LIMIT 100`,[scope,this.scopeId(actor,scope)]);
  return {scope,changes:rows};
 });}
 async preview(actor:UserAuth,sid:string,body:any){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['scope','key','body','context'].includes(k)))throw new BadRequestException('Unsupported preview field');
  const scope=scopeOf(body.scope);const prepared=candidate(scope,body.key,body.body);
  const context=body.context??{};
  if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).some(k=>!prepared.definition.allowedTokens.includes(k)))throw new BadRequestException('Unsupported preview variable');
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,actor,sid,scope,false);
   let text:string;try{text=renderPlainText(prepared.body,context,prepared.definition)}catch(e){return bad(e)}
   return {text,notice:prepared.definition.category==='Reports'?NON_OFFICIAL_NOTICE:null,watermark:'UNPUBLISHED PREVIEW — NOT AN OFFICIAL DOCUMENT',sent:false};
  });
 }
 async propose(actor:UserAuth,sid:string,body:any){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['scope','key','body','expectedRevision','reason'].includes(k)))throw new BadRequestException('Unsupported template configuration field');
  const scope=scopeOf(body.scope);const p=candidate(scope,body.key,body.body);const expected=revision(body.expectedRevision);const why=reason(body.reason);
  return this.db.transaction(async tx=>{
   await this.currentAdmin(tx,actor,sid,scope,true);
   const scopeId=this.scopeId(actor,scope);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:content:${scope}:${scopeId}:${p.definition.key}`]);
   const {rows}=await tx.query('SELECT revision FROM admin_content_templates WHERE scope=$1 AND scope_id=$2 AND template_key=$3 FOR UPDATE',[scope,scopeId,p.definition.key]);
   if(Number(rows[0]?.revision||0)!==expected)throw new ConflictException('Template revision is stale; reload and retry');
   const pending=await tx.query(`SELECT id FROM admin_content_proposals WHERE scope=$1 AND scope_id=$2 AND template_key=$3 AND status='PENDING' FOR UPDATE`,[scope,scopeId,p.definition.key]);
   if(pending.rows.length)throw new ConflictException('A revision is already awaiting independent approval');
   const id=uid(),status=p.requiresApproval?'PENDING':'APPROVED';
   await tx.query(`INSERT INTO admin_content_proposals(id,scope,scope_id,template_key,proposed_body,expected_revision,reason,status,submitted_by,submitted_org_id,reviewed_by,reviewed_org_id,reviewed_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,scope,scopeId,p.definition.key,p.body,expected,why,status,actor.id,actor.organizationId,p.requiresApproval?null:actor.id,p.requiresApproval?null:actor.organizationId,p.requiresApproval?null:new Date()]);
   if(!p.requiresApproval)await this.apply(tx,scope,scopeId,p.definition.key,p.body,expected,actor);
   await this.audit.write(tx,actor,p.requiresApproval?'CONTENT_TEMPLATE_PROPOSED':'CONTENT_TEMPLATE_APPLIED','template',id,{scope,key:p.definition.key,expectedRevision:expected,reason:why});
   return {id,status,key:p.definition.key,revision:p.requiresApproval?expected:expected+1,notice:p.requiresApproval?'Awaiting independent administrator approval. Published template unchanged.':'Updated template published and audited.'};
  });
 }
 private async apply(tx:PoolClient,scope:TemplateScope,scopeId:string,key:string,body:string,expected:number,actor:UserAuth){
  const {rows}=await tx.query(`INSERT INTO admin_content_templates(scope,scope_id,template_key,body,revision,updated_by,updated_by_org_id)
   VALUES($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(scope,scope_id,template_key) DO UPDATE SET body=EXCLUDED.body,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_by_org_id=EXCLUDED.updated_by_org_id,updated_at=now()
    WHERE admin_content_templates.revision=$8 RETURNING revision`,[scope,scopeId,key,body,expected+1,actor.id,actor.organizationId,expected]);
  if(rows.length!==1)throw new ConflictException('Template modified concurrently; reload');
 }
 async decide(actor:UserAuth,sid:string,idInput:string,input:unknown){
  const vote=decision(input),id=isUuid(idInput);
  return this.db.transaction(async tx=>{
   // Privilege checks precede access to pending proposal details.
   await this.currentAdmin(tx,actor,sid,'organization',true);
   const {rows}=await tx.query(`SELECT * FROM admin_content_proposals WHERE id=$1 AND
    ((scope='organization' AND scope_id=$2) OR (scope='platform' AND EXISTS
      (SELECT 1 FROM platform_admin_appointments WHERE user_id=$3 AND revoked_at IS NULL)))`,[id,actor.organizationId,actor.id]);
   let p=rows[0];if(!p||p.status!=='PENDING')throw new NotFoundException('Pending revision not found');
   const scope=scopeOf(p.scope);if(scope==='platform')await this.currentAdmin(tx,actor,sid,'platform',true);
   if(p.submitted_by===actor.id)throw new ForbiddenException('Independent administrator approval required');
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:content:${scope}:${p.scope_id}:${p.template_key}`]);
   const locked=await tx.query('SELECT * FROM admin_content_proposals WHERE id=$1 AND scope=$2 AND scope_id=$3 FOR UPDATE',[id,scope,p.scope_id]);
   p=locked.rows[0];if(!p||p.status!=='PENDING')throw new ConflictException('Revision already decided');
   const proposer=await tx.query(`SELECT u.id FROM users u ${scope==='platform'?'JOIN platform_admin_appointments a ON a.user_id=u.id AND a.revoked_at IS NULL':''}
     WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL FOR SHARE OF u`,[p.submitted_by,p.submitted_org_id]);
   if(proposer.rows.length!==1)throw new ForbiddenException('Proposer is no longer an active authorized administrator');
   const current=await tx.query('SELECT revision FROM admin_content_templates WHERE scope=$1 AND scope_id=$2 AND template_key=$3 FOR UPDATE',[scope,p.scope_id,p.template_key]);
   const expected=Number(p.expected_revision);
   if(Number(current.rows[0]?.revision||0)!==expected)throw new ConflictException('Template changed after proposal');
   const validated=candidate(scope,p.template_key,p.proposed_body);
   if(!validated.requiresApproval)throw new ConflictException('This template does not use the approval path');
   if(vote==='APPROVE')await this.apply(tx,scope,p.scope_id,validated.definition.key,validated.body,expected,actor);
   await tx.query(`UPDATE admin_content_proposals SET status=$4,reviewed_by=$5,reviewed_org_id=$6,reviewed_at=now()
     WHERE id=$1 AND scope=$2 AND scope_id=$3`,[id,scope,p.scope_id,vote==='APPROVE'?'APPROVED':'REJECTED',actor.id,actor.organizationId]);
   await this.audit.write(tx,actor,vote==='APPROVE'?'CONTENT_TEMPLATE_APPROVED':'CONTENT_TEMPLATE_REJECTED','template',id,{scope,key:p.template_key,decision:vote,revision:expected+1});
   return {id,status:vote==='APPROVE'?'APPROVED':'REJECTED',published:vote==='APPROVE'};
  });
 }
}
@Controller('admin-content')@UseGuards(AuthGuard)
export class ContentAdminController {
 constructor(private svc:ContentAdminService){}
 @Get('templates')templates(@Req()r:any,@Query('scope')s:string){return this.svc.templates(r.user,r.sessionId,scopeOf(s));}
 @Get('changes')history(@Req()r:any,@Query('scope')s:string){return this.svc.history(r.user,r.sessionId,scopeOf(s));}
 @Post('preview')preview(@Req()r:any,@Body()b:any){return this.svc.preview(r.user,r.sessionId,b);}
 @Post('changes')propose(@Req()r:any,@Body()b:any){return this.svc.propose(r.user,r.sessionId,b);}
 @Post('changes/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.decide(r.user,r.sessionId,id,b?.decision);}
}
@Module({imports:[AuthModule,AuditModule],providers:[ContentAdminService],controllers:[ContentAdminController]})
export class ContentAdminModule{}
