import {Controller,Get,Req,UseGuards,Injectable,Module,ForbiddenException} from '@nestjs/common';
import {Database} from '../../../database';
import {AuthGuard,AuthModule} from '../../../auth';
import type {UserAuth} from '../../../common';
import type {PoolClient} from 'pg';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {requireBillingActivation} from './billing-activation';
import {ENTITLEMENT_POLICY_KEY,commercialAccess,parseEntitlementPolicyText,type Subscription} from '../domain/commercial-policy';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
const CAPABILITY='BILLING.JOURNAL_EXPORT';
async function access(tx:PoolClient,org:string){
 // Same policy lock used by independent administrator approval.
 await tx.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))',[`assettrust:admin:platform:${PLATFORM_ID}:${ENTITLEMENT_POLICY_KEY}`]);
 const {rows}=await tx.query(`SELECT v.version,v.value FROM public.admin_configuration_values v
 JOIN public.admin_configuration_changes c ON c.scope=v.scope AND c.scope_id=v.scope_id AND c.setting_key=v.setting_key
 AND c.expected_version=v.version-1 AND c.proposed_value=v.value
 WHERE v.scope='platform' AND v.scope_id=$1 AND v.setting_key=$2 AND c.status='APPROVED'
 AND c.reviewed_by IS NOT NULL AND c.reviewed_by<>c.submitted_by`,[PLATFORM_ID,ENTITLEMENT_POLICY_KEY]);
 if(rows.length!==1)return 'DENIED' as const;
 const policy=parseEntitlementPolicyText(rows[0].value,Number(rows[0].version));
 if(!policy.enabled)return 'DENIED' as const;
 const codes=policy.mappings.find(m=>m.capability===CAPABILITY)?.serviceCodes??[];
 if(!codes.length)return 'DENIED' as const;
 const time=await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms');
 const now=Number(time.rows[0]?.now_ms);
 if(!Number.isSafeInteger(now)||now<0)return 'DENIED' as const;
 const terms=await tx.query(`SELECT t.organization_id,t.code,t.catalog_version,t.funding_invoice_id,t.starts_at,t.ends_at
 FROM public.billing_subscriptions t JOIN public.billing_invoices i ON i.organization_id=t.organization_id AND i.id=t.funding_invoice_id
 JOIN public.billing_settlements s ON s.organization_id=i.organization_id AND s.invoice_id=i.id
 JOIN public.billing_catalog_versions cv ON cv.version=i.catalog_version
 JOIN LATERAL jsonb_array_elements(cv.prices) p ON p->>'code'=t.code
 WHERE t.organization_id=$1 AND t.code=ANY($2::text[]) AND i.state='PAID' AND i.revision=2
 AND s.amount_ugx=i.total_ugx AND s.currency=i.currency AND i.payment_key=replace(jsonb_build_array(s.provider_id,s.transaction_id)::text, ', ', ',')
 AND t.catalog_version=i.catalog_version AND jsonb_array_length(i.lines)=1
 AND i.lines->0->>'code'=t.code AND i.lines->0->>'quantity'='1'
 AND p->>'periodDays' IS NOT NULL AND t.ends_at-t.starts_at=(p->>'periodDays')::bigint*86400000
 AND t.starts_at<=$3 AND t.ends_at>$3-$4::bigint*86400000
 AND EXISTS(SELECT 1 FROM public.billing_journal j WHERE j.organization_id=i.organization_id AND j.invoice_id=i.id
 AND j.revision=2 AND j.event='PAID' AND j.debit_account='PAYMENT_CLEARING' AND j.credit_account='RECEIVABLE' AND j.amount_ugx=i.total_ugx)`,
 [org,codes,now,policy.graceDays]);
 const verified:Subscription[]=terms.rows.map(t=>({organizationId:t.organization_id,code:t.code,catalogVersion:Number(t.catalog_version),fundingInvoiceId:t.funding_invoice_id,startsAt:Number(t.starts_at),endsAt:Number(t.ends_at)}));
 return commercialAccess(policy,org,CAPABILITY,now,verified);
}
@Injectable()
export class CommercialEntitlementsService{
 constructor(private readonly db:Database){}
 private async scoped<T>(actor:UserAuth,sid:string,work:(tx:PoolClient)=>Promise<T>):Promise<T>{
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);await requireBillingActivation(tx);
   return work(tx);
  });
 }
 async status(actor:UserAuth,sid:string){
  return this.scoped(actor,sid,async tx=>({capability:CAPABILITY,state:await access(tx,actor.organizationId)}));
 }
 async journalExport(actor:UserAuth,sid:string){
  return this.scoped(actor,sid,async tx=>{
   const state=await access(tx,actor.organizationId);
   if(state==='DENIED')throw new ForbiddenException('Optional journal export requires an approved paid entitlement');
   const {rows}=await tx.query(`SELECT invoice_id,revision,event,debit_account,credit_account,amount_ugx,recorded_at
     FROM public.billing_journal WHERE organization_id=$1 ORDER BY recorded_at DESC,invoice_id,revision LIMIT 1001`,[actor.organizationId]);
   return {kind:'ASSETTRUST_FINANCIAL_JOURNAL_EXPORT',organizationId:actor.organizationId,currency:'UGX',access:state,
    limit:1000,truncated:rows.length>1000,entries:rows.slice(0,1000),notice:'Recorded journal entries only; not a cash balance, tax report or complete financial statement.'};
  });
 }
}
@Controller('billing/entitlements')@UseGuards(AuthGuard)
export class CommercialEntitlementsController{
 constructor(private readonly svc:CommercialEntitlementsService){}
 @Get('status')status(@Req()r:any){return this.svc.status(r.user,r.sessionId);}
 @Get('journal-export')journalExport(@Req()r:any){return this.svc.journalExport(r.user,r.sessionId);}
}
@Module({imports:[AuthModule],providers:[CommercialEntitlementsService],controllers:[CommercialEntitlementsController]})
export class CommercialEntitlementsModule{}
