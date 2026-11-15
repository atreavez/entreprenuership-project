import {setTenantScope} from './contexts/tenant-isolation/application/tenant-scope';
import {requireCurrentOrganizationAdmin} from './contexts/access/infrastructure/transactional-access';
import { ForbiddenException, Injectable, Module, NotFoundException, BadRequestException } from '@nestjs/common';
import { Database } from './database';
import { UserAuth, isUuid, assertRole, uid } from './common';
import { AuditModule,AuditService } from './audit';
import { AuthModule,AuthGuard } from './auth';
import { Controller,Get,Post,Delete,Body,Param,Req,UseGuards } from '@nestjs/common';
export const visibilitySQL = `(a.created_by=$2 OR EXISTS (SELECT 1 FROM verification_cases v WHERE v.asset_id=a.id AND v.organization_id=a.organization_id AND (v.created_by=$2 OR v.assigned_to=$2)) OR EXISTS (SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=a.organization_id AND g.grantee_id=$2 AND g.expires_at>now()))`;
@Injectable()
export class AccessService {
 constructor(private db:Database){}
 async asset(user:UserAuth,id:string,contribute=false){
  const {rows}=await this.db.tenantQuery(user.organizationId,`SELECT a.id FROM assets a WHERE a.id=$1 AND a.organization_id=$2`,[isUuid(id),user.organizationId]);
  if(!rows.length)throw new NotFoundException('Asset not found');
  if(user.role==='ORG_ADMIN')return;
  const grant=await this.db.tenantQuery(user.organizationId,`SELECT 1 FROM assets a WHERE a.id=$1 AND a.organization_id=$2 AND (a.created_by=$3
    OR EXISTS (SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=$2 AND (c.created_by=$3 OR c.assigned_to=$3))
    OR EXISTS (SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=$2 AND g.grantee_id=$3 AND g.expires_at>now() ${contribute?"AND g.permission='CONTRIBUTE'":''}))`,[id,user.organizationId,user.id]);
  if(!grant.rows.length)throw new ForbiddenException('You have no access to this asset');
 }
 async case(user:UserAuth,id:string,contribute=false){
  const {rows}=await this.db.tenantQuery(user.organizationId,'SELECT asset_id,created_by,assigned_to FROM verification_cases WHERE id=$1 AND organization_id=$2',[isUuid(id),user.organizationId]);
  if(!rows.length)throw new NotFoundException('Case not found');
  if(user.role==='ORG_ADMIN'||rows[0].created_by===user.id||rows[0].assigned_to===user.id)return rows[0];
  // Asset grants do not confer access to confidential case files or professional notes.
  throw new ForbiddenException('Case access requires being a creator, assignee, or organization administrator');
 }
 async orgUser(user:UserAuth,otherId:string){const {rows}=await this.db.tenantQuery(user.organizationId,'SELECT id FROM users WHERE id=$1 AND organization_id=$2',[isUuid(otherId),user.organizationId]);if(!rows.length)throw new BadRequestException('User not a member of your organization');}
}
@Controller('access')@UseGuards(AuthGuard)
export class AccessController {
 constructor(private db:Database,private access:AccessService,private audit:AuditService){}
 @Get('assets/:id/grants')async list(@Req()r:any,@Param('id')id:string){
  const u=r.user as UserAuth;assertRole(u,['ORG_ADMIN']);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await requireCurrentOrganizationAdmin(tx,u);
   const asset=await tx.query('SELECT id FROM assets WHERE id=$1 AND organization_id=$2 FOR SHARE',[isUuid(id),u.organizationId]);
   if(!asset.rows.length)throw new NotFoundException('Asset not found');
   const {rows}=await tx.query(`SELECT g.id,g.permission,g.expires_at,member.full_name,member.email
    FROM resource_grants g JOIN users member ON member.id=g.grantee_id AND member.organization_id=g.organization_id
    WHERE g.organization_id=$1 AND g.asset_id=$2 ORDER BY g.created_at DESC`,[u.organizationId,id]);
   return rows;
  });
 }
 @Post('assets/:id/grants')async grant(@Req()r:any,@Param('id')id:string,@Body()b:any){
  const u=r.user as UserAuth;assertRole(u,['ORG_ADMIN']);
  if(b.permission!=='READ'&&b.permission!=='CONTRIBUTE')throw new BadRequestException('Invalid permission');
  const expires=new Date(b.expiresAt);
  if(!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()||expires.getTime()>Date.now()+365*86400000)
   throw new BadRequestException('Expiry must be in the next 365 days');
  await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await requireCurrentOrganizationAdmin(tx,u);
   const asset=await tx.query('SELECT id FROM assets WHERE id=$1 AND organization_id=$2 FOR SHARE',[isUuid(id),u.organizationId]);
   if(!asset.rows.length)throw new NotFoundException('Asset not found');
   const member=await tx.query('SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND suspended_at IS NULL FOR SHARE',[isUuid(b.granteeId),u.organizationId]);
   if(!member.rows.length)throw new BadRequestException('Grantee must be an active organization member');
   await tx.query(`INSERT INTO resource_grants(id,organization_id,asset_id,grantee_id,permission,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(organization_id,asset_id,grantee_id) DO UPDATE SET permission=excluded.permission,expires_at=excluded.expires_at,created_by=excluded.created_by`,
    [uid(),u.organizationId,id,b.granteeId,b.permission,expires.toISOString(),u.id]);
   await this.audit.write(tx,u,'ACCESS_GRANTED','asset',id,{granteeId:b.granteeId,permission:b.permission,expiresAt:expires.toISOString()});
  });
  return {ok:true};
 }
 @Delete('grants/:id')async revoke(@Req()r:any,@Param('id')id:string){
  const u=r.user as UserAuth;assertRole(u,['ORG_ADMIN']);
  await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await requireCurrentOrganizationAdmin(tx,u);
   const result=await tx.query('DELETE FROM resource_grants WHERE id=$1 AND organization_id=$2 RETURNING asset_id,grantee_id',[isUuid(id),u.organizationId]);
   if(!result.rows.length)throw new NotFoundException('Grant not found');
   await this.audit.write(tx,u,'ACCESS_REVOKED','asset',result.rows[0].asset_id,{granteeId:result.rows[0].grantee_id});
  });
  return {ok:true};
 }
}

@Module({imports:[AuthModule,AuditModule],providers:[AccessService],controllers:[AccessController],exports:[AccessService]})export class AccessModule{}
