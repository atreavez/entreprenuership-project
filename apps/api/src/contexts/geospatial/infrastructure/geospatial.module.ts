import { Module,Controller,Get,Post,Param,Query,Body,Req,UseGuards,BadRequestException,InternalServerErrorException,ForbiddenException } from '@nestjs/common';
import { AuthModule,AuthGuard } from '../../../auth';
import { AccessModule,AccessService } from '../../../access';
import { AuditModule } from '../../../audit';
import { isUuid } from '../../../common';
import { canReviewBoundary } from '../domain/parcel-boundary';
import { ParcelUseCases } from '../application/parcel-usecases';
import { PgParcelRepository } from './pg-parcel.repository';
@Controller('geo')@UseGuards(AuthGuard)
class ParcelController{
 constructor(private readonly useCases:ParcelUseCases,private readonly access:AccessService){}
 private async safe<T>(callback:()=>Promise<T>){try{return await callback()}catch(e:any){if(e?.getStatus)throw e;if(e?.name==='ParcelDomainError')throw new BadRequestException(e.message);throw new InternalServerErrorException('Geospatial request could not be completed')}}
 @Get('parcels')search(@Req()r:any,@Query('bbox')bbox:string){return this.safe(()=>this.useCases.search(r.user,bbox))}
 @Get('assets/:id/parcels')async list(@Req()r:any,@Param('id')id:string){await this.access.asset(r.user,isUuid(id));return this.useCases.list(r.user,id)}
 @Post('assets/:id/parcels')async create(@Req()r:any,@Param('id')id:string,@Body()body:any){await this.access.asset(r.user,isUuid(id),true);return this.safe(()=>this.useCases.create(r.user,id,body))}
 @Get('assets/:id/parcels/:claimId/overlaps')async overlaps(@Req()r:any,@Param('id')id:string,@Param('claimId')claimId:string){await this.access.asset(r.user,isUuid(id));return this.safe(()=>this.useCases.overlaps(r.user,id,isUuid(claimId)))}
 @Post('assets/:id/parcels/:claimId/submit')async submit(@Req()r:any,@Param('id')id:string,@Param('claimId')claimId:string){await this.access.asset(r.user,isUuid(id),true);return this.safe(()=>this.useCases.submit(r.user,id,isUuid(claimId)))}
 @Post('assets/:id/parcels/:claimId/review')async review(@Req()r:any,@Param('id')id:string,@Param('claimId')claimId:string,@Body()body:any){await this.access.asset(r.user,isUuid(id),true);if(!canReviewBoundary(r.user,''))throw new ForbiddenException('Accredited surveyor role required');return this.safe(()=>this.useCases.review(r.user,r.sessionId,id,isUuid(claimId),body))}
}
@Module({imports:[AuthModule,AccessModule,AuditModule],providers:[PgParcelRepository,{provide:ParcelUseCases,useFactory:(repo:PgParcelRepository)=>new ParcelUseCases(repo),inject:[PgParcelRepository]}],controllers:[ParcelController]})
export class GeospatialModule{}
