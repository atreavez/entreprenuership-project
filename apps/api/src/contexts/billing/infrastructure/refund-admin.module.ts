import {Controller,Get,Post,Req,Param,Body,UseGuards,Injectable,Module,BadRequestException,ConflictException,NotFoundException,ForbiddenException} from '@nestjs/common';
import {Database} from '../../../database';
import {AuthModule,AuthGuard} from '../../../auth';
import {AuditModule,AuditService} from '../../../audit';
import {uid,isUuid,type UserAuth} from '../../../common';
import type {PoolClient} from 'pg';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {requireAdjustmentSchema,adjustmentOrganizationLock,adjustmentInvoiceLock} from './adjustment-activation';
import {parseRefundRequest,parseRefundDecision,canApproveRefund} from '../domain/refund-review';
const notice='Review of an existing provider reference only. No refund is initiated or confirmed by approval.';
async function lockInvoice(tx:PoolClient,org:string,id:string){
 await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[adjustmentOrganizationLock(org)]);
 await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[adjustmentInvoiceLock(org,id)]);
}
async function funding(tx:PoolClient,org:string,id:string){
 const {rows}=await tx.query(`SELECT s.provider_id,s.transaction_id,s.amount_ugx FROM public.billing_settlements s
 JOIN public.billing_invoices i ON i.organization_id=s.organization_id AND i.id=s.invoice_id
 WHERE i.organization_id=$1 AND i.id=$2 AND i.state='PAID' AND i.revision=2 AND i.currency='UGX'
 AND s.currency=i.currency AND s.amount_ugx=i.total_ugx AND i.payment_key=replace(jsonb_build_array(s.provider_id,s.transaction_id)::text, ', ', ',')
 AND EXISTS(SELECT 1 FROM public.billing_journal j WHERE j.organization_id=i.organization_id AND j.invoice_id=i.id AND j.revision=1 AND j.event='ISSUED' AND j.amount_ugx=i.total_ugx)
 AND EXISTS(SELECT 1 FROM public.billing_journal j WHERE j.organization_id=i.organization_id AND j.invoice_id=i.id AND j.revision=2 AND j.event='PAID' AND j.amount_ugx=i.total_ugx)`,[org,id]);
 if(rows.length!==1)throw new NotFoundException('Verified paid invoice unavailable');return rows[0];
}
async function totals(tx:PoolClient,org:string,id:string){
 const {rows}=await tx.query(`SELECT
 (SELECT coalesce(sum(amount_ugx),0) FROM public.billing_adjustments WHERE organization_id=$1 AND invoice_id=$2) AS reversed,
 (SELECT coalesce(sum(a.amount_ugx),0) FROM public.billing_refund_approvals a WHERE a.organization_id=$1 AND a.invoice_id=$2
 AND NOT EXISTS(SELECT 1 FROM public.billing_adjustments j WHERE j.organization_id=a.organization_id AND j.approval_id=a.id)) AS reserved`,[org,id]);
 return {reversed:Number(rows[0]?.reversed),reserved:Number(rows[0]?.reserved)};
}
@Injectable()
export class RefundAdminService{
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 private scoped<T>(a:UserAuth,sid:string,fn:(tx:PoolClient)=>Promise<T>){
  return this.db.transaction(async tx=>{await setTenantScope(tx,a.organizationId);await assertCurrentAdminStepUp(tx,a,sid);await requireAdjustmentSchema(tx);return fn(tx);});
 }
 async list(a:UserAuth,sid:string){
  return this.scoped(a,sid,async tx=>{
   const {rows}=await tx.query(`SELECT r.id,r.invoice_id,r.provider_id,r.transaction_id,r.adjustment_id,r.amount_ugx,r.submitted_by,r.reason,r.submitted_at,
    coalesce(d.decision,'PENDING') AS decision,d.reviewer_id,d.reason AS decision_reason,d.decided_at
    FROM public.billing_refund_requests r LEFT JOIN public.billing_refund_decisions d ON d.organization_id=r.organization_id AND d.request_id=r.id
    WHERE r.organization_id=$1 ORDER BY r.submitted_at DESC,r.id LIMIT 100`,[a.organizationId]);
   const adjustments=await tx.query('SELECT invoice_id,provider_id,adjustment_id,kind,amount_ugx,currency,approval_id,recorded_at FROM public.billing_adjustments WHERE organization_id=$1 ORDER BY recorded_at DESC,adjustment_id LIMIT 100',[a.organizationId]);
   return {requests:rows,adjustments:adjustments.rows,dispatchState:'NOT_CONNECTED',notice};
  });
 }
 async propose(a:UserAuth,sid:string,body:unknown){
  let input;try{input=parseRefundRequest(body);}catch{throw new BadRequestException('Invalid refund review request');}
  return this.scoped(a,sid,async tx=>{
   const org=a.organizationId;await lockInvoice(tx,org,input.invoiceId);
   const f=await funding(tx,org,input.invoiceId),sum=await totals(tx,org,input.invoiceId);
   if(!Number.isSafeInteger(sum.reversed)||!Number.isSafeInteger(sum.reserved)||sum.reversed<0||sum.reserved<0||input.amountUgx>Number(f.amount_ugx)-sum.reversed-sum.reserved)throw new ConflictException('Refund exceeds available unreserved payment');
   const id=uid();
   const r=await tx.query(`INSERT INTO public.billing_refund_requests(id,organization_id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx,submitted_by,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,provider_id,adjustment_id) DO NOTHING RETURNING id`,
    [id,org,input.invoiceId,f.provider_id,f.transaction_id,input.adjustmentId,input.amountUgx,a.id,input.reason]);
   if(r.rowCount!==1)throw new ConflictException('Refund reference already submitted');
   await this.audit.write(tx,a,'BILLING_REFUND_REVIEW_REQUESTED','invoice',input.invoiceId,{requestId:id,amountUgx:input.amountUgx,adjustmentId:input.adjustmentId});
   return {id,decision:'PENDING',notice};
  });
 }
 async decide(a:UserAuth,sid:string,id:string,body:unknown){
  const requestId=isUuid(id);let input;try{input=parseRefundDecision(body);}catch{throw new BadRequestException('Invalid refund decision');}
  return this.scoped(a,sid,async tx=>{
   const org=a.organizationId;
   const find=await tx.query('SELECT * FROM public.billing_refund_requests WHERE organization_id=$1 AND id=$2',[org,requestId]);
   if(find.rows.length!==1)throw new NotFoundException('Refund request unavailable');
   const r=find.rows[0];await lockInvoice(tx,org,r.invoice_id);
   if(r.submitted_by===a.id)throw new ForbiddenException('Independent reviewer required');
   const prior=await tx.query('SELECT request_id FROM public.billing_refund_decisions WHERE organization_id=$1 AND request_id=$2',[org,requestId]);
   if(prior.rows.length)throw new ConflictException('Refund already decided');
   if(input.decision==='APPROVE'){
    const member=await tx.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE",[r.submitted_by,org]);
    if(member.rows.length!==1)throw new ForbiddenException('Original requester is no longer authorized');
    const f=await funding(tx,org,r.invoice_id),sum=await totals(tx,org,r.invoice_id);
    if(f.provider_id!==r.provider_id||f.transaction_id!==r.transaction_id||!canApproveRefund(r.submitted_by,a.id,Number(f.amount_ugx),sum.reversed,sum.reserved,Number(r.amount_ugx)))throw new ConflictException('Refund approval no longer eligible');
   }
   const d=await tx.query('INSERT INTO public.billing_refund_decisions(organization_id,request_id,reviewer_id,decision,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING request_id',[org,requestId,a.id,input.decision,input.reason]);
   if(d.rowCount!==1)throw new ConflictException('Refund already decided');
   if(input.decision==='APPROVE'){
    const approved=await tx.query(`INSERT INTO public.billing_refund_approvals(id,organization_id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx,submitted_by,approved_by,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`,[requestId,org,r.invoice_id,r.provider_id,r.transaction_id,r.adjustment_id,r.amount_ugx,r.submitted_by,a.id,input.reason]);
    if(approved.rowCount!==1)throw new ConflictException('Refund reference unavailable');
   }
   await this.audit.write(tx,a,'BILLING_REFUND_REVIEW_'+input.decision,'invoice',r.invoice_id,{requestId,amountUgx:Number(r.amount_ugx),reason:input.reason});
   return {id:requestId,decision:input.decision,notice};
  });
 }
}
@Controller('billing/adjustments')@UseGuards(AuthGuard)
export class RefundAdminController{
 constructor(private readonly svc:RefundAdminService){}
 @Get()list(@Req()r:any){return this.svc.list(r.user,r.sessionId);}
 @Post('requests')propose(@Req()r:any,@Body()b:unknown){return this.svc.propose(r.user,r.sessionId,b);}
 @Post('requests/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()b:unknown){return this.svc.decide(r.user,r.sessionId,id,b);}
}
@Module({imports:[AuthModule,AuditModule],providers:[RefundAdminService],controllers:[RefundAdminController]})
export class RefundAdminModule{}
