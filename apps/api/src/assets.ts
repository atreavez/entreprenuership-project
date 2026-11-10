import { Controller, Get, Post, Param, Query, Body, Req, UseGuards, Injectable, Module, NotFoundException, BadRequestException } from '@nestjs/common';
import { Database } from './database';
import { AuditModule, AuditService } from './audit';
import { AuthGuard,AuthModule } from './auth';
import { uid, text, optionalText, enumValue, UserAuth, assertRole, isUuid } from './common';
import {AccessModule,AccessService} from './access';
const ASSET_TYPES=['LAND','BUILDING','VEHICLE','MACHINERY','COOPERATIVE_ASSET'] as const;
@Injectable()
export class AssetsService{
 constructor(private db:Database,private audit:AuditService,private access:AccessService){}
 async list(u:UserAuth,query:any){
  const q=String(query?.search||'').slice(0,150);
  const type=query?.type?enumValue(query.type,ASSET_TYPES,'assetType'):null;
  const {rows}=await this.db.query(`SELECT id,asset_code,asset_type,district,description,declared_owner,tenure,parcel_reference,area_acres,status,created_at
    FROM assets a WHERE a.organization_id=$1 AND ($2::text IS NULL OR asset_type=$2)
    AND (asset_code ILIKE $3 OR district ILIKE $3 OR declared_owner ILIKE $3)
    AND ($4::bool OR a.created_by=$5 OR EXISTS(SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=a.organization_id AND (c.created_by=$5 OR c.assigned_to=$5))
    OR EXISTS(SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=a.organization_id AND g.grantee_id=$5 AND g.expires_at>now()))
    ORDER BY a.created_at DESC LIMIT 200`,[u.organizationId,type,`%${q}%`,u.role==='ORG_ADMIN',u.id]);return rows;
 }
 async get(u:UserAuth,id:string){
  await this.access.asset(u,id);
  const {rows}=await this.db.query('SELECT * FROM assets WHERE id=$1 AND organization_id=$2',[isUuid(id),u.organizationId]);
  if(!rows[0])throw new NotFoundException('Asset not found');return rows[0];
 }
 async create(u:UserAuth,data:any){assertRole(u,['ORG_ADMIN','CLIENT','REVIEWER']);
  const assetType=enumValue(data?.assetType,ASSET_TYPES,'assetType');
  const district=text(data?.district,'district',90),owner=text(data?.declaredOwner,'declaredOwner',160);
  const description=optionalText(data?.description,'description',1200),tenure=optionalText(data?.tenure,'tenure',90),parcel=optionalText(data?.parcelReference,'parcelReference',130);
  const area=data?.areaAcres===undefined||data?.areaAcres===null||data?.areaAcres===''?null:Number(data.areaAcres);
  if(area!==null&&(!Number.isFinite(area)||area<=0||area>100000000))throw new BadRequestException('Invalid acreage');
  const id=uid(),code=`AT-${assetType.slice(0,2)}-${id.slice(0,8).toUpperCase()}`;
  await this.db.transaction(async tx=>{
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
