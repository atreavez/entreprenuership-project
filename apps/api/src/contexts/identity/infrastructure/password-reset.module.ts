import {Body, Controller, ForbiddenException, HttpCode, Module, Post, Req} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import type {Request} from 'express';
import {AuditService} from '../../../audit';
import {isAllowedRequestOrigin} from '../domain/request-origin-policy';
import {PasswordResetService} from './password-reset.service';
function requireBrowserOrigin(req:Request){
 const allowed=(process.env.WEB_ORIGIN||'http://localhost:5173').split(',').map(s=>s.trim());
 if(!isAllowedRequestOrigin({origin:req.headers.origin,fetchSite:req.headers['sec-fetch-site']},allowed,true))
  throw new ForbiddenException('Cross-origin credential request rejected');
}
@Controller('auth/password')
export class PasswordResetController {
 constructor(private readonly service:PasswordResetService){}
 @Throttle({default:{limit:5,ttl:60000}}) @Post('reset/request') @HttpCode(202)
 async request(@Req()req:Request,@Body()body:any){requireBrowserOrigin(req);return this.service.request(body?.email)}
 @Throttle({default:{limit:5,ttl:60000}}) @Post('reset/confirm') @HttpCode(200)
 async confirm(@Req()req:Request,@Body()body:any){requireBrowserOrigin(req);return this.service.confirm(body?.token,body?.newPassword)}
}
@Module({providers:[PasswordResetService,AuditService],controllers:[PasswordResetController]})
export class PasswordResetModule{}
