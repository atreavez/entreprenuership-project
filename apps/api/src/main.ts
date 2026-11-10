import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule,ThrottlerGuard } from '@nestjs/throttler';
import helmet from 'helmet';
import { DatabaseModule } from './database';
import { AuthModule } from './auth';
import { AuditModule } from './audit';
import { AssetsModule } from './assets';
import { CasesModule } from './cases';
import { DocumentsModule } from './documents';
import { DashboardModule } from './dashboard';
import {AccessModule} from './access';
import {TeamModule} from './team';
import {OperationsModule} from './operations';
import {IntegrationsModule} from './integrations';
import {NotificationsModule} from './notifications';
import {ProfessionalTrustModule} from './professional-trust';
import { GeospatialModule } from './contexts/geospatial/infrastructure/geospatial.module';
import { SchemaProbe } from './contexts/platform/infrastructure/schema-probe';
import { ServiceUnavailableException } from '@nestjs/common';
import { validateRuntimeConfig } from './contexts/platform/domain/runtime-config';
@Controller()class HealthController{constructor(private schema:SchemaProbe){}
 @Get('healthz')get(){return {ok:true,service:'assettrust-api',version:'0.21.0',...(process.env.NODE_ENV!=='production'&&process.env.ASSETTRUST_E2E_TARGET_ID?{e2eTargetId:process.env.ASSETTRUST_E2E_TARGET_ID}:{})};}
 @Get('readyz')async ready(){const state=await this.schema.check();if(!state.ready)throw new ServiceUnavailableException('Database or schema not ready');return {ok:true,database:'ready',postgis:'ready',schema:'v0.11'};}
}
@Module({imports:[
  ThrottlerModule.forRoot([{ttl:60000,limit:100}]),
  DatabaseModule,AuthModule,AuditModule,AssetsModule,CasesModule,DocumentsModule,DashboardModule,AccessModule,TeamModule,OperationsModule,IntegrationsModule,NotificationsModule,ProfessionalTrustModule,GeospatialModule
],controllers:[HealthController],providers:[SchemaProbe,{provide:APP_GUARD,useClass:ThrottlerGuard}]})class AppModule{}
async function bootstrap(){
 const assessment=validateRuntimeConfig(process.env);
 if(!assessment.ok)throw new Error('Startup configuration rejected: '+assessment.issues.map(i=>i.code).join(', '));
 // Encryption keys must be present before any document upload/download is permitted.
 const {loadKeyring}=await import('./contexts/document-vault/infrastructure/aes-gcm-envelope');
 loadKeyring();
 const app=await NestFactory.create(AppModule,{bodyParser:true});
 // Fail closed: never accept traffic against an unknown or partially applied schema.
 try { await app.get(SchemaProbe).assertReady(); } catch (error) { await app.close(); throw error; }
 app.use(helmet());app.use((req:any,res:any,next:any)=>{res.setHeader('Cache-Control','no-store');next();});app.enableCors({origin:(process.env.WEB_ORIGIN||'http://localhost:5173').split(','),methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']});
 app.use((req:any,res:any,next:any)=>{if(req.method==='POST' || req.method==='PATCH' || req.method==='DELETE')res.setHeader('X-AssetTrust-Audit-Policy','sensitive-writes-audited');next();});
 app.setGlobalPrefix('api/v1');
 const port=Number(process.env.PORT||4000);
 // Test APIs carrying disposable markers should never be reachable from the LAN.
 const host=process.env.NODE_ENV==='test'?'127.0.0.1':(process.env.API_BIND_HOST||'0.0.0.0');
 await app.listen(port,host);console.log(`AssetTrust API http://localhost:${port}/api/v1/healthz`);
}
bootstrap().catch(e=>{console.error(e);process.exitCode=1;});
