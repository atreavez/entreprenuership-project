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
  const {rows}=await this.db.query(`SELECT a.id FROM assets a WHERE a.id=$1 AND a.organization_id=$2`,[isUuid(id),user.organizationId]);
  if(!rows.length)throw new NotFoundException('Asset not found');
  if(user.role==='ORG_ADMIN')return;
  const grant=await this.db.query(`SELECT 1 FROM assets a WHERE a.id=$1 AND a.organization_id=$2 AND (a.created_by=$3
    OR EXISTS (SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=$2 AND (c.created_by=$3 OR c.assigned_to=$3))
    OR EXISTS (SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=$2 AND g.grantee_id=$3 AND g.expires_at>now() ${contribute?"AND g.permission='CONTRIBUTE'":''}))`,[id,user.organizationId,user.id]);
  if(!grant.rows.length)throw new ForbiddenException('You have no access to this asset');
 }
 async case(user:UserAuth,id:string,contribute=false){
  const {rows}=await this.db.query('SELECT asset_id,created_by,assigned_to FROM verification_cases WHERE id=$1 AND organization_id=$2',[isUuid(id),user.organizationId]);
  if(!rows.length)throw new NotFoundException('Case not found');
  if(user.role==='ORG_ADMIN'||rows[0].created_by===user.id||rows[0].assigned_to===user.id)return rows[0];
  // Asset grants do not confer access to confidential case files or professional notes.
  throw new ForbiddenException('Case access requires being a creator, assignee, or organization administrator');
 }
 async orgUser(user:UserAuth,otherId:string){const {rows}=await this.db.query('SELECT id FROM users WHERE id=$1 AND organization_id=$2',[isUuid(otherId),user.organizationId]);if(!rows.length)throw new BadRequestException('User not a member of your organization');}
}
@Controller('access')@UseGuards(AuthGuard)
class AccessController {
 constructor(private db:Database,private access:AccessService,private audit:AuditService){}
 @Get('assets/:id/grants')async list(@Req()r:any,@Param('id')id:string){assertRole(r.user,['ORG_ADMIN']);await this.access.asset(r.user,id);const {rows}=await this.db.query(`SELECT g.id,g.permission,g.expires_at,u.full_name,u.email FROM resource_grants g JOIN users u ON u.id=g.grantee_id WHERE g.organization_id=$1 AND g.asset_id=$2 ORDER BY g.created_at DESC`,[r.user.organizationId,isUuid(id)]);return rows;}
 @Post('assets/:id/grants')async grant(@Req()r:any,@Param('id')id:string,@Body()b:any){const u=r.user as UserAuth;assertRole(u,['ORG_ADMIN']);await this.access.asset(u,id);await this.access.orgUser(u,b.granteeId);
  if(b.permission!=='READ'&&b.permission!=='CONTRIBUTE')throw new BadRequestException('Invalid permission');
  const expires=new Date(b.expiresAt);if(!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()||expires.getTime()>Date.now()+365*86400000)throw new BadRequestException('Expiry must be in the next 365 days');
  await this.db.transaction(async tx=>{await tx.query(`INSERT INTO resource_grants(id,organization_id,asset_id,grantee_id,permission,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
  ON CONFLICT(organization_id,asset_id,grantee_id) DO UPDATE SET permission=excluded.permission,expires_at=excluded.expires_at,created_by=excluded.created_by`,[uid(),u.organizationId,id,b.granteeId,b.permission,expires.toISOString(),u.id]);await this.audit.write(tx,u,'ACCESS_GRANTED','asset',id,{granteeId:b.granteeId,permission:b.permission,expiresAt:expires.toISOString()});});return {ok:true};}
 @Delete('grants/:id')async revoke(@Req()r:any,@Param('id')id:string){const u=r.user as UserAuth;assertRole(u,['ORG_ADMIN']);await this.db.transaction(async tx=>{const result=await tx.query('DELETE FROM resource_grants WHERE id=$1 AND organization_id=$2 RETURNING asset_id,grantee_id',[isUuid(id),u.organizationId]);if(!result.rows.length)throw new NotFoundException('Grant not found');await this.audit.write(tx,u,'ACCESS_REVOKED','asset',result.rows[0].asset_id,{granteeId:result.rows[0].grantee_id});});return {ok:true};}
}
@Module({imports:[AuthModule,AuditModule],providers:[AccessService],controllers:[AccessController],exports:[AccessService]})export class AccessModule{}
