import { Controller, Get, Req, UseGuards, Module } from '@nestjs/common';
import { AuthGuard, AuthModule } from './auth';
import { AuditService } from './audit-service';
export { AuditService, auditHash } from './audit-service';

@Controller('audit')@UseGuards(AuthGuard)
export class AuditController{constructor(private svc:AuditService){}@Get('verify')verify(@Req()req:any){return this.svc.verify(req.user);}@Get()list(@Req()req:any){return this.svc.list(req.user);}}
@Module({imports:[AuthModule],providers:[AuditService],controllers:[AuditController],exports:[AuditService]})export class AuditModule{}
