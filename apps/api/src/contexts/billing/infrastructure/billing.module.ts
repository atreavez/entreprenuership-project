import {Body,Controller,Get,Post,Param,Req,UseGuards,Injectable,Module,BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {Database} from '../../../database';
import {AuditModule,AuditService} from '../../../audit';
import {AuthGuard,AuthModule} from '../../../auth';
import {uid,isUuid,type UserAuth} from '../../../common';
import {PgBillingRepository} from './pg-billing.repository';
import {requireBillingActivation} from './billing-activation';
import {issueInvoice,voidInvoice,type Invoice} from '../domain/commercial-policy';
import type {BillingTransaction} from '../application/payment.port';
function exact(value:any,keys:string[]):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function integer(value:unknown,min:number,max:number):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;}
@Injectable()
export class BillingAdminService{
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 private async run<T>(actor:UserAuth,sid:string,work:(tx:BillingTransaction)=>Promise<T>){
  // Gate before repository access. No billing data can be served while the
  // migration remains staged. On release, the runtime readiness gate also
  // checks reviewed policies and effective grants.
  await requireBillingActivation(this.db);
  const repository=new PgBillingRepository(this.db,this.audit,actor,sid);
  return repository.transaction(actor.organizationId,work);
 }
 async catalog(actor:UserAuth,sid:string){
  return this.run(actor,sid,async tx=>({catalog:await tx.approvedCatalog(),paymentState:'NOT_CONNECTED'}));
 }
 async list(actor:UserAuth,sid:string){
  return this.run(actor,sid,async tx=>({invoices:await tx.listInvoices(actor.organizationId),paymentState:'NOT_CONNECTED'}));
 }
 async journal(actor:UserAuth,sid:string){
  return this.run(actor,sid,async tx=>({entries:await tx.journal(actor.organizationId)}));
 }
 async subscriptions(actor:UserAuth,sid:string){
  return this.run(actor,sid,async tx=>({subscriptions:await tx.subscriptions(actor.organizationId),activationState:'NOT_CONNECTED'}));
 }
 async get(actor:UserAuth,sid:string,id:string){
  const invoiceId=isUuid(id);
  return this.run(actor,sid,async tx=>{const invoice=await tx.invoice(actor.organizationId,invoiceId);if(!invoice)throw new NotFoundException('Invoice not found');return invoice;});
 }
 async create(actor:UserAuth,sid:string,body:any){
  if(!exact(body,['expectedCatalogVersion','items'])||!integer(body.expectedCatalogVersion,1,2147483647)||!Array.isArray(body.items)||body.items.length<1||body.items.length>100||
   body.items.some((item:any)=>!exact(item,['code','quantity'])||typeof item.code!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(item.code)||!integer(item.quantity,1,10000)))
   throw new BadRequestException('Invalid invoice request');
  return this.run(actor,sid,async tx=>{
   const catalog=await tx.approvedCatalog();
   if(!catalog||catalog.version!==body.expectedCatalogVersion)throw new ConflictException('Approved catalog changed or unavailable');
   let total=0;const seen=new Set<string>();
   for(const item of body.items){
    const price=catalog.prices.find(p=>p.code===item.code);
    if(!price||seen.has(item.code))throw new BadRequestException('Unknown or duplicate catalog item');
    seen.add(item.code);total+=price.unitUgx*item.quantity;
    if(!integer(total,1,1000000000))throw new BadRequestException('Invoice total exceeds limit');
   }
   return tx.createDraft(uid(),catalog.version,body.items);
  });
 }
 async transition(actor:UserAuth,sid:string,id:string,body:any){
  const invoiceId=isUuid(id);
  if(!exact(body,['expectedRevision','action'])||!integer(body.expectedRevision,0,2)||!['ISSUE','VOID'].includes(body.action))throw new BadRequestException('Invalid invoice action');
  return this.run(actor,sid,async tx=>{
   const current=await tx.invoice(actor.organizationId,invoiceId);
   if(!current)throw new NotFoundException('Invoice not found');
   if(current.revision!==body.expectedRevision)throw new ConflictException('Invoice revision changed');
   const catalog=body.action==='ISSUE'?await tx.approvedCatalog():null;
   if(body.action==='ISSUE'&&(current.state!=='DRAFT'||!catalog||catalog.version!==current.catalogVersion)||
      body.action==='VOID'&&!['DRAFT','ISSUED'].includes(current.state))throw new ConflictException('Invoice cannot perform requested transition');
   const change=body.action==='ISSUE'?issueInvoice(current,current.revision,catalog!.version):voidInvoice(current,current.revision);
   if(!await tx.commit(actor.organizationId,current.revision,change))throw new ConflictException('Invoice revision changed');
   return {invoice:change.invoice,paymentState:'NOT_CONNECTED'};
  });
 }
}
@Controller('billing')@UseGuards(AuthGuard)
export class BillingAdminController{
 constructor(private readonly svc:BillingAdminService){}
 @Get('catalog')catalog(@Req()r:any){return this.svc.catalog(r.user,r.sessionId);}
 @Get('invoices')list(@Req()r:any){return this.svc.list(r.user,r.sessionId);}
 @Get('journal')journal(@Req()r:any){return this.svc.journal(r.user,r.sessionId);}
 @Get('subscriptions')subscriptions(@Req()r:any){return this.svc.subscriptions(r.user,r.sessionId);}
 @Get('invoices/:id')get(@Req()r:any,@Param('id')id:string){return this.svc.get(r.user,r.sessionId,id);}
 @Post('invoices')create(@Req()r:any,@Body()body:any){return this.svc.create(r.user,r.sessionId,body);}
 @Post('invoices/:id/transition')transition(@Req()r:any,@Param('id')id:string,@Body()body:any){return this.svc.transition(r.user,r.sessionId,id,body);}
}
@Module({imports:[AuthModule,AuditModule],providers:[BillingAdminService],controllers:[BillingAdminController]})
export class BillingModule{}
