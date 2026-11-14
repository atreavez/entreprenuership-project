import {Controller,Get,Param,Injectable,Module,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {publishText,assertPublicCopyKey,type PublishedText} from '../domain/publication-policy';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
type Reader={query(sql:string,parameters?:any[]):Promise<{rows:any[]}>};
/** Read-only adapter; never reads pending admin_content_proposals. */
@Injectable()
export class PublishedContentService{
 constructor(private readonly db:Database){}
 async organization(reader:Reader,organizationId:string,key:string,context:Record<string,unknown>):Promise<PublishedText>{
  const {rows}=await reader.query(`SELECT body,revision FROM admin_content_templates
    WHERE scope='organization' AND scope_id=$1 AND template_key=$2`,[organizationId,key]);
  return publishText('organization',key,rows[0]||null,context);
 }
 async publicCopy(input:unknown):Promise<{key:string;text:string;revision:number;source:string;legalStatus:'UNOFFICIAL_PLATFORM_INFORMATION'}>{
  let key:string;try{key=assertPublicCopyKey(input)}catch{throw new NotFoundException('Public copy not found')}
  const {rows}=await this.db.query(`SELECT body,revision FROM admin_content_templates
    WHERE scope='platform' AND scope_id=$1 AND template_key=$2`,[PLATFORM_ID,key]);
  const out=publishText('platform',key,rows[0]||null,{});
  return {...out,legalStatus:'UNOFFICIAL_PLATFORM_INFORMATION'};
 }
}
/** Public allowlist only. No organization IDs, proposals, evidence or private template bodies. */
@Controller('public-content')
export class PublicContentController{
 constructor(private readonly published:PublishedContentService){}
 @Get(':key')read(@Param('key')key:string){return this.published.publicCopy(key)}
}
@Module({providers:[PublishedContentService],controllers:[PublicContentController],exports:[PublishedContentService]})
export class PublishedContentModule{}
