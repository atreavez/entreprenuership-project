import 'reflect-metadata';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
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
import { AdminControlModule } from './contexts/admin-control/infrastructure/admin-control.module';
import { MemberManagementModule } from './contexts/member-management/infrastructure/member-management.module';
import { WorkflowAdminModule } from './contexts/workflow-admin/infrastructure/workflow-admin.module';
import { ContentAdminModule } from './contexts/content-admin/infrastructure/content-admin.module';
import { ReportIssuanceModule } from './contexts/report-issuance/infrastructure/report-issuance.module';
import { ReportLayoutModule } from './contexts/report-layout/infrastructure/report-layout.module';
import { ReportSharingModule } from './contexts/report-sharing/infrastructure/report-sharing.module';
import { ProviderAdminModule } from './contexts/provider-admin/infrastructure/provider-admin.module';
import { PublishedContentModule } from './contexts/content-publishing/infrastructure/published-content.module';
import {PasswordResetModule} from './contexts/identity/infrastructure/password-reset.module';
import { SchemaProbe } from './contexts/platform/infrastructure/schema-probe';
import { ServiceUnavailableException } from '@nestjs/common';
import { validateRuntimeConfig,allowedWebOrigins,apiListenPort,apiListenHost } from './contexts/platform/domain/runtime-config';
// Both src/main.ts (development) and dist/main.js (production) are one directory below apps/api.
// Refuse to misreport a stale hard-coded version in health responses.
const API_VERSION=JSON.parse(readFileSync(resolve(__dirname,'../package.json'),'utf8')).version as string;
@Controller()class HealthController{constructor(private schema:SchemaProbe){}
 @Get('healthz')get(){return {ok:true,service:'assettrust-api',version:API_VERSION,...(process.env.NODE_ENV!=='production'&&process.env.ASSETTRUST_E2E_TARGET_ID?{e2eTargetId:process.env.ASSETTRUST_E2E_TARGET_ID}:{})};}
 @Get('readyz')async ready(){const state=await this.schema.check();if(!state.ready)throw new ServiceUnavailableException('Database or schema not ready');return {ok:true,service:'assettrust-api',version:API_VERSION,database:'ready',postgis:'ready',schema:'verified-migration-ledger',migrationsVerified:state.verifiedMigrations,security:'rls-policy-contract-verified',rlsPoliciesVerified:state.policiesVerified,protectedTablesVerified:state.tablesVerified};}
}
@Module({imports:[
  ThrottlerModule.forRoot([{ttl:60000,limit:100}]),
  DatabaseModule,AuthModule,PasswordResetModule,AuditModule,AssetsModule,CasesModule,DocumentsModule,DashboardModule,AccessModule,TeamModule,OperationsModule,IntegrationsModule,NotificationsModule,ProfessionalTrustModule,GeospatialModule,AdminControlModule,MemberManagementModule,WorkflowAdminModule,ContentAdminModule,PublishedContentModule,ProviderAdminModule,ReportIssuanceModule,ReportLayoutModule,ReportSharingModule
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
 app.use(helmet());app.use((req:any,res:any,next:any)=>{res.setHeader('Cache-Control','no-store');next();});app.enableCors({origin:allowedWebOrigins(process.env.WEB_ORIGIN,process.env.NODE_ENV==='production'),methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']});
 app.use((req:any,res:any,next:any)=>{if(req.method==='POST' || req.method==='PATCH' || req.method==='DELETE')res.setHeader('X-AssetTrust-Audit-Policy','sensitive-writes-audited');next();});
 app.setGlobalPrefix('api/v1');
 const port=apiListenPort(process.env.PORT);
 // Test APIs carrying disposable markers should never be reachable from the LAN.
 const host=apiListenHost(process.env);
 await app.listen(port,host);console.log(`AssetTrust API http://localhost:${port}/api/v1/healthz`);
}
bootstrap().catch(e=>{console.error(e);process.exitCode=1;});
