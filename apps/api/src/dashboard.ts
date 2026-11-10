import { Controller, Get, Param, Req, UseGuards, Injectable, Module, NotFoundException } from '@nestjs/common';
import { Database } from './database';
import { AuthGuard,AuthModule } from './auth';
import { UserAuth,isUuid } from './common';
import {AccessModule,AccessService} from './access';
@Injectable()
export class DashboardService{
 constructor(private db:Database,private access:AccessService){}
 async summary(u:UserAuth){
  const privileged=u.role==='ORG_ADMIN';
  const [assets,cases,docs,recent]=await Promise.all([
    this.db.query(`SELECT count(*)::int total,count(*) FILTER(WHERE a.status='REVIEW_COMPLETED')::int reviewed,
      count(*) FILTER(WHERE a.status='FLAGGED')::int flagged FROM assets a WHERE a.organization_id=$1
      AND ($2::bool OR a.created_by=$3 OR EXISTS(SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=$1 AND (c.created_by=$3 OR c.assigned_to=$3))
      OR EXISTS(SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=$1 AND g.grantee_id=$3 AND g.expires_at>now()))`,[u.organizationId,privileged,u.id]),
    this.db.query(`SELECT count(*)::int total,count(*) FILTER(WHERE c.status='OPEN')::int open,
      count(*) FILTER(WHERE c.stage='LEGAL_REVIEW')::int legal_review FROM verification_cases c
      JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id WHERE c.organization_id=$1
      AND ($2::bool OR c.created_by=$3 OR c.assigned_to=$3)`,[u.organizationId,privileged,u.id]),
    this.db.query(`SELECT count(*)::int total FROM documents d WHERE d.organization_id=$1
      AND ($2::bool OR (
      (d.case_id IS NOT NULL AND EXISTS(SELECT 1 FROM verification_cases dc WHERE dc.id=d.case_id
       AND dc.organization_id=d.organization_id AND (dc.created_by=$3 OR dc.assigned_to=$3)))
       OR (d.case_id IS NULL AND EXISTS(SELECT 1 FROM assets a WHERE a.id=d.asset_id
        AND a.organization_id=d.organization_id AND (a.created_by=$3 OR EXISTS(
         SELECT 1 FROM verification_cases ca WHERE ca.asset_id=a.id AND ca.organization_id=a.organization_id
           AND (ca.created_by=$3 OR ca.assigned_to=$3)) OR EXISTS(
         SELECT 1 FROM resource_grants g WHERE g.asset_id=a.id AND g.organization_id=a.organization_id
           AND g.grantee_id=$3 AND g.expires_at>now()))))
      ))`,[u.organizationId,privileged,u.id]),
    this.db.query(`SELECT c.id,c.case_code,c.stage,c.status,c.created_at,a.asset_code,a.district,a.asset_type,a.declared_owner
      FROM verification_cases c JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
      WHERE c.organization_id=$1 AND ($2::bool OR c.created_by=$3 OR c.assigned_to=$3)
      ORDER BY c.created_at DESC LIMIT 6`,[u.organizationId,privileged,u.id])
  ]);
  return {assets:assets.rows[0],cases:cases.rows[0],documents:docs.rows[0],recentCases:recent.rows};
 }
 async report(u:UserAuth,id:string){
  await this.access.case(u,id);
  const c=await this.db.query(`SELECT c.*,a.asset_code,a.asset_type,a.district,a.declared_owner,a.parcel_reference,a.tenure,a.area_acres
     FROM verification_cases c JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
     WHERE c.id=$1 AND c.organization_id=$2`,[isUuid(id),u.organizationId]);
  if(!c.rows.length)throw new NotFoundException('Case not found');
  const evidence=await this.db.query(`SELECT stage,evidence_type,source_name,reference,observations,recorded_by,review_status,reviewed_by,reviewed_at,review_notes,created_at
     FROM case_evidence WHERE organization_id=$1 AND case_id=$2 ORDER BY created_at`,[u.organizationId,id]);
  return {reportType:'NON_OFFICIAL_DUE_DILIGENCE_EVIDENCE_SUMMARY',case:c.rows[0],evidence:evidence.rows,
    assuranceLevel:'MANUAL_EVIDENCE_REVIEW_NO_OFFICIAL_REGISTRY_ATTESTATION',
    disclaimer:'This is a record of checks entered by platform users, not a government-issued title, ownership certificate, registry extract or guarantee of legal ownership. Confirm all matters with the proper authorities and qualified professionals.'};
 }
}
@Controller()@UseGuards(AuthGuard)
export class DashboardController{
 constructor(private svc:DashboardService){}
 @Get('dashboard')dashboard(@Req()r:any){return this.svc.summary(r.user);}
 @Get('reports/case/:id')report(@Req()r:any,@Param('id')id:string){return this.svc.report(r.user,id);}
 @Get('billing/plans')plans(){return {currency:'UGX',mode:'CATALOG_ONLY_NO_PAYMENTS',plans:[
  {code:'STARTER',name:'Starter',monthlyPrice:0,features:['Document vault','Manual verification workflow']},
  {code:'PROFESSIONAL',name:'Professional',monthlyPrice:249000,features:['Organization workspaces','Evidence summaries','Audit history']},
  {code:'ENTERPRISE',name:'Enterprise',monthlyPrice:null,features:['Custom tenancy','Partner integrations (subject to agreement)']}
 ],notice:'Prices are illustrative only; no payment, subscription or money-handling integration is active.'};}
}
@Module({imports:[AuthModule,AccessModule],providers:[DashboardService],controllers:[DashboardController]})export class DashboardModule{}
