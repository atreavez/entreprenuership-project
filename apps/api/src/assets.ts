import {setTenantScope} from './contexts/tenant-isolation/application/tenant-scope';
import { Controller, Get, Post, Param, Query, Body, Req, UseGuards, Injectable, Module, NotFoundException, BadRequestException } from '@nestjs/common';
import { Database } from './database';
import { AuditModule, AuditService } from './audit';
import { AuthGuard,AuthModule } from './auth';
import { uid, text, optionalText, enumValue, UserAuth, assertRole, isUuid } from './common';
import {AccessModule,AccessService} from './access';
import {requireCurrentAssetRead,requireCurrentOrganizationRole} from './contexts/access/infrastructure/transactional-access';
const ASSET_TYPES=['LAND','BUILDING','VEHICLE','MACHINERY','COOPERATIVE_ASSET'] as const;
@Injectable()
export class AssetsService{
 constructor(private db:Database,private audit:AuditService,private access:AccessService){}
 async list(u:UserAuth,query:any){
  const q=String(query?.search||'').slice(0,150);
  const type=query?.type?enumValue(query.type,ASSET_TYPES,'assetType'):null;
  // One statement checks current active membership and role; never pass a
  // potentially stale request-time ORG_ADMIN boolean into an unrestricted list.
  const {rows}=await this.db.tenantQuery(u.organizationId,`SELECT a.id,a.asset_code,a.asset_type,a.district,a.description,a.declared_owner,a.tenure,a.parcel_reference,a.area_acres,a.status,a.created_at
    FROM assets a JOIN users actor ON actor.id=$4 AND actor.organization_id=a.organization_id AND actor.suspended_at IS NULL
    WHERE a.organization_id=$1 AND ($2::text IS NULL OR a.asset_type=$2)
    AND (a.asset_code ILIKE $3 OR a.district ILIKE $3 OR a.declared_owner ILIKE $3)
    AND (actor.role='ORG_ADMIN' OR a.created_by=actor.id OR EXISTS(SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=a.organization_id AND (c.created_by=actor.id OR c.assigned_to=actor.id))
    OR EXISTS(SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=a.organization_id AND g.grantee_id=actor.id AND g.expires_at>now()))
    ORDER BY a.created_at DESC LIMIT 200`,[u.organizationId,type,`%${q}%`,u.id]);return rows;
 }
 async get(u:UserAuth,id:string){
  const assetId=isUuid(id);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   // The authorization lock survives through the asset read and transaction end.
   await requireCurrentAssetRead(tx,u,assetId);
   const {rows}=await tx.query('SELECT * FROM assets WHERE id=$1 AND organization_id=$2',[assetId,u.organizationId]);
   if(!rows[0])throw new NotFoundException('Asset not found');return rows[0];
  });
 }
 async create(u:UserAuth,data:any){assertRole(u,['ORG_ADMIN','CLIENT','REVIEWER']);
  const assetType=enumValue(data?.assetType,ASSET_TYPES,'assetType');
  const district=text(data?.district,'district',90),owner=text(data?.declaredOwner,'declaredOwner',160);
  const description=optionalText(data?.description,'description',1200),tenure=optionalText(data?.tenure,'tenure',90),parcel=optionalText(data?.parcelReference,'parcelReference',130);
  const area=data?.areaAcres===undefined||data?.areaAcres===null||data?.areaAcres===''?null:Number(data.areaAcres);
  if(area!==null&&(!Number.isFinite(area)||area<=0||area>100000000))throw new BadRequestException('Invalid acreage');
  const id=uid(),code=`AT-${assetType.slice(0,2)}-${id.slice(0,8).toUpperCase()}`;
  await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   await requireCurrentOrganizationRole(tx,u,['ORG_ADMIN','CLIENT','REVIEWER']);
   await tx.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,description,declared_owner,tenure,parcel_reference,area_acres,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,u.organizationId,code,assetType,district,description,owner,tenure||null,parcel||null,area,u.id]);
   await this.audit.write(tx,u,'ASSET_CREATED','asset',id,{assetCode:code});
  });return this.get(u,id);
 }
}
@Controller('assets')@UseGuards(AuthGuard)
export class AssetsController{
 constructor(private svc:AssetsService){}
 @Get()list(@Req()r:any,@Query()q:any){return this.svc.list(r.user,q);}
 @Get(':id')get(@Req()r:any,@Param('id')id:string){return this.svc.get(r.user,id);}
 @Post()create(@Req()r:any,@Body()data:any){return this.svc.create(r.user,data);}
}
@Module({imports:[AuthModule,AuditModule,AccessModule],providers:[AssetsService],controllers:[AssetsController],exports:[AssetsService]})export class AssetsModule{}
