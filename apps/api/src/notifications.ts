import {Controller,Get,Patch,Param,Req,UseGuards,Module,Injectable,NotFoundException} from '@nestjs/common';
import {AuthModule,AuthGuard} from './auth';
import {Database} from './database';
import {isUuid,UserAuth} from './common';
@Injectable()
class NotificationsService {
 constructor(private db:Database){}
 async list(u:UserAuth){const {rows}=await this.db.tenantRecipientQuery(u.organizationId,u.id,`SELECT id,category,title,body,resource_type,resource_id,read_at,created_at
 FROM notifications WHERE organization_id=$1 AND recipient_id=$2 ORDER BY created_at DESC LIMIT 100`,[u.organizationId,u.id]);return rows;}
 async markRead(u:UserAuth,id:string){const r=await this.db.tenantRecipientQuery(u.organizationId,u.id,'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND organization_id=$2 AND recipient_id=$3 RETURNING id,read_at',[isUuid(id),u.organizationId,u.id]);if(!r.rows.length)throw new NotFoundException('Notification not found');return r.rows[0];}
}
@Controller('notifications')@UseGuards(AuthGuard)
class NotificationsController {
 constructor(private svc:NotificationsService){}
 @Get()list(@Req()r:any){return this.svc.list(r.user);}
 @Patch(':id/read')read(@Req()r:any,@Param('id')id:string){return this.svc.markRead(r.user,id);}
}
@Module({imports:[AuthModule],providers:[NotificationsService],controllers:[NotificationsController]})export class NotificationsModule{}
