import {BadRequestException,ConflictException,ForbiddenException,NotFoundException,Controller,Get,Post,Param,Body,Req,Header,UseGuards,Injectable,Module} from '@nestjs/common';
import {Database} from '../../../database';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {uid,isUuid,type UserAuth} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {ReportIssuanceService,ReportIssuanceModule} from '../../report-issuance/infrastructure/report-issuance.module';
import {assertReportLayout,assertExpectedLayoutRevision,assertLayoutReason,assertLayoutVote,DEFAULT_REPORT_LAYOUT,type ReportPdfLayout} from '../../report-issuance/domain/report-layout-policy';

const strict=(input:unknown,keys:string[])=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k))||Object.keys(input).length!==keys.length)
  throw new BadRequestException('Unexpected report layout fields');
};
const validate=<T>(fn:()=>T):T=>{try{return fn()}catch(e){throw new BadRequestException(e instanceof Error?e.message:'Invalid layout')}};
const locked=(tx:{query(sql:string,params?:unknown[]):Promise<unknown>},org:string)=>tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:pdf-layout:${org}`]);

@Injectable()
export class ReportLayoutService{
 constructor(private readonly db:Database,private readonly audit:AuditService,private readonly issuance:ReportIssuanceService){}
 private async current(tx:any,org:string):Promise<{revision:number;layout:ReportPdfLayout}>{
  const {rows}=await tx.query(`SELECT a.revision,r.layout FROM report_pdf_layout_active a
   JOIN report_pdf_layout_revisions r ON r.organization_id=a.organization_id AND r.revision=a.revision
   WHERE a.organization_id=$1`,[org]);
  if(!rows.length)return {revision:0,layout:{...DEFAULT_REPORT_LAYOUT}};
  return {revision:Number(rows[0].revision),layout:{...rows[0].layout,revision:Number(rows[0].revision)}};
 }
 async list(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await assertCurrentAdminStepUp(tx,actor,sid);await setTenantScope(tx,actor.organizationId);
  const active=await this.current(tx,actor.organizationId);
  const [proposals,revisions]=await Promise.all([
   tx.query(`SELECT id,proposed_layout AS layout,expected_revision,reason,proposed_by,proposed_at,status,decided_by,decided_at
    FROM report_pdf_layout_proposals WHERE organization_id=$1 ORDER BY proposed_at DESC LIMIT 50`,[actor.organizationId]),
   tx.query(`SELECT revision,layout,approved_by,approved_at FROM report_pdf_layout_revisions
    WHERE organization_id=$1 ORDER BY revision DESC LIMIT 50`,[actor.organizationId])
  ]);
  return {active,proposals:proposals.rows,revisions:revisions.rows,
   notice:'PDF branding only. Report facts, evidence, status, signatures and the non-official legal notice are not editable here.'};
 });}
 async propose(actor:UserAuth,sid:string,input:any){
  strict(input,['layout','expectedRevision','reason']);
  const layout=validate(()=>assertReportLayout(input.layout)),expectedRevision=validate(()=>assertExpectedLayoutRevision(input.expectedRevision));
  const reason=validate(()=>assertLayoutReason(input.reason));
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);await setTenantScope(tx,actor.organizationId);await locked(tx,actor.organizationId);
   const current=await this.current(tx,actor.organizationId);
   if(current.revision!==expectedRevision)throw new ConflictException('Approved PDF layout changed; refresh and retry');
   const pending=await tx.query(`SELECT id FROM report_pdf_layout_proposals
    WHERE organization_id=$1 AND status='PENDING' FOR UPDATE`,[actor.organizationId]);
   if(pending.rows.length)throw new ConflictException('An existing layout proposal requires independent review');
   const id=uid();
   await tx.query(`INSERT INTO report_pdf_layout_proposals
    (id,organization_id,proposed_layout,expected_revision,reason,proposed_by)
    VALUES($1,$2,$3::jsonb,$4,$5,$6)`,
    [id,actor.organizationId,JSON.stringify(layout),expectedRevision,reason,actor.id]);
   await this.audit.write(tx,actor,'REPORT_PDF_LAYOUT_PROPOSED','report_pdf_layout_proposal',id,{expectedRevision});
   return {id,status:'PENDING',expectedRevision};
  });
 }
 async decide(actor:UserAuth,sid:string,idInput:string,input:any){
  strict(input,['decision']);const id=isUuid(idInput),decision=validate(()=>assertLayoutVote(input.decision));
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);await setTenantScope(tx,actor.organizationId);await locked(tx,actor.organizationId);
   const {rows}=await tx.query(`SELECT * FROM report_pdf_layout_proposals
    WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[id,actor.organizationId]);
   const p=rows[0];if(!p)throw new NotFoundException('PDF layout proposal not found');
   if(p.status!=='PENDING')throw new ConflictException('PDF layout proposal already decided');
   if(p.proposed_by===actor.id)throw new ForbiddenException('A separate administrator must decide the PDF layout');
   const proposer=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2
    AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE`,[p.proposed_by,actor.organizationId]);
   if(!proposer.rows.length)throw new ForbiddenException('The proposing administrator is no longer authorized');
   const current=await this.current(tx,actor.organizationId);
   const expected=Number(p.expected_revision);
   if(current.revision!==expected)throw new ConflictException('PDF layout revision has changed; reject the stale proposal and propose again');
   let revision:number|null=null;
   if(decision==='APPROVE'){
    // The policy is repeated at approval to fail closed on malformed imported/stored proposals.
    const layout=validate(()=>assertReportLayout(p.proposed_layout));revision=current.revision+1;
    await tx.query(`INSERT INTO report_pdf_layout_revisions
     (organization_id,revision,layout,proposal_id,approved_by) VALUES($1,$2,$3::jsonb,$4,$5)`,
     [actor.organizationId,revision,JSON.stringify(layout),id,actor.id]);
    await tx.query(`INSERT INTO report_pdf_layout_active (organization_id,revision)
     VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET revision=excluded.revision,updated_at=now()`,
     [actor.organizationId,revision]);
   }
   await tx.query(`UPDATE report_pdf_layout_proposals
    SET status=$3,decided_by=$4,decided_at=now() WHERE id=$1 AND organization_id=$2`,
    [id,actor.organizationId,decision==='APPROVE'?'APPROVED':'REJECTED',actor.id]);
   await this.audit.write(tx,actor,decision==='APPROVE'?'REPORT_PDF_LAYOUT_APPROVED':'REPORT_PDF_LAYOUT_REJECTED',
    'report_pdf_layout_proposal',id,{revision,expectedRevision:expected});
   return {id,status:decision==='APPROVE'?'APPROVED':'REJECTED',revision};
  });
 }
 /** Existing report snapshot remains unchanged: only approved presentation is applied at export time. */
 async exportPdf(actor:UserAuth,sid:string,idInput:string){
  const reportId=isUuid(idInput);
  const active=await this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);await setTenantScope(tx,actor.organizationId);
   return this.current(tx,actor.organizationId);
  });
  const layout=active.revision>0?active.layout:undefined;
  return this.issuance.pdfExport(actor,sid,reportId,layout);
 }
}
@Controller('reports/layout')@UseGuards(AuthGuard)
export class ReportLayoutController{
 constructor(private readonly service:ReportLayoutService){}
 @Get()list(@Req()r:any){return this.service.list(r.user,r.sessionId)}
 @Post('proposals')propose(@Req()r:any,@Body()body:any){return this.service.propose(r.user,r.sessionId,body)}
 @Post('proposals/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()body:any){return this.service.decide(r.user,r.sessionId,id,body)}
 @Get('export/:id')@Header('Cache-Control','private, no-store')exportPdf(@Req()r:any,@Param('id')id:string){return this.service.exportPdf(r.user,r.sessionId,id)}
}
@Module({imports:[AuthModule,AuditModule,ReportIssuanceModule],providers:[ReportLayoutService],controllers:[ReportLayoutController]})
export class ReportLayoutModule{}
