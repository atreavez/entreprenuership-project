import {BadRequestException,ConflictException,ForbiddenException,NotFoundException,ServiceUnavailableException,Controller,Get,Post,Param,Body,Req,Header,UseGuards,Injectable,Module} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditService,AuditModule} from '../../../audit';
import {uid,isUuid,type UserAuth} from '../../../common';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {canonicalSnapshot} from '../../report-issuance/domain/report-policy';
import {makeBundlePayload} from '../../report-issuance/domain/signed-attestation';
import {renderPrivateReportPdf,signPdfReceipt} from '../../report-issuance/domain/signed-pdf';
import type {ReportPdfLayout} from '../../report-issuance/domain/report-layout-policy';
import {assertShareInput,assertDecision,assertRevocationReason,newShareSecrets,shareSecretHash,matchShareSecrets,assertRedeemable,strictObject,SHARE_NOTICE} from '../domain/share-policy';
import {attemptBlocked} from '../domain/attempt-policy';

const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const checked=<T>(fn:()=>T):T=>{try{return fn()}catch(e){throw new BadRequestException(e instanceof Error?e.message:'Invalid request')}};
const unavailable=()=>new NotFoundException('Recipient access is unavailable');
const lock=(tx:PoolClient,org:string,reportId:string)=>tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:report:${org}:${reportId}`]);
/** Uses the same report-status gates as issuance. Refuse unsafe/stale evidence at proposal, approval and redemption. */
async function checkedReport(tx:PoolClient,org:string,reportId:string){
 await setTenantScope(tx,org);
 // Lock report+case first. A second SQL statement gets a FRESH READ COMMITTED snapshot
 // after waiting for any concurrent withdrawal, successor or dispute FK writer to finish.
 const {rows}=await tx.query(`SELECT r.id,r.organization_id,r.case_id,r.snapshot,r.snapshot_sha256,r.issued_at,
  c.status AS case_status FROM issued_verification_reports r
  JOIN verification_cases c ON c.id=r.case_id AND c.organization_id=r.organization_id
  WHERE r.id=$1 AND r.organization_id=$2 FOR UPDATE OF r,c`,[reportId,org]);
 if(rows.length!==1)throw unavailable();
 const r=rows[0];
 const {rows:flags}=await tx.query(`SELECT
  EXISTS(SELECT 1 FROM issued_report_withdrawals w WHERE w.report_id=$1 AND w.organization_id=$2) AS withdrawn,
  EXISTS(SELECT 1 FROM report_withdrawal_proposals p WHERE p.report_id=$1 AND p.organization_id=$2 AND p.status='PENDING') AS withdrawal_pending,
  EXISTS(SELECT 1 FROM issued_verification_reports successor WHERE successor.supersedes_report_id=$1 AND successor.organization_id=$2) AS superseded,
  EXISTS(SELECT 1 FROM disputes d WHERE d.case_id=$3 AND d.organization_id=$2 AND d.status IN ('OPEN','INVESTIGATING')) AS disputed`,[reportId,org,r.case_id]);
 const f=flags[0];
 if(f.withdrawn||f.withdrawal_pending||f.superseded||f.disputed||r.case_status!=='CLOSED')throw new ConflictException('Report is no longer eligible for confidential sharing');
 if(sha(canonicalSnapshot(r.snapshot))!==r.snapshot_sha256)throw new ConflictException('Report integrity check failed');
 return r;
}
@Injectable()
export class ReportSharingService{
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 async list(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await assertCurrentAdminStepUp(tx,actor,sid);
  const [shares,events,security]=await Promise.all([
   tx.query(`SELECT id,report_id,recipient_label,reason,expires_hours,max_downloads,download_count,status,proposed_by,proposed_at,reviewed_by,reviewed_at,expires_at,revoked_by,revoked_at,revocation_reason
     FROM report_recipient_shares WHERE organization_id=$1 ORDER BY proposed_at DESC LIMIT 100`,[actor.organizationId]),
   tx.query(`SELECT id,share_id,report_id,pdf_sha256,signing_key_id,redeemed_at
     FROM report_share_redemptions WHERE organization_id=$1 ORDER BY redeemed_at DESC LIMIT 100`,[actor.organizationId]),
   tx.query(`SELECT w.share_id,w.failed_count,w.window_started_at,w.last_failed_at
     FROM report_share_access_windows w JOIN report_recipient_shares s ON s.id=w.share_id AND s.organization_id=w.organization_id
     WHERE w.organization_id=$1 AND w.window_started_at>now()-interval '15 minutes' AND w.failed_count >= 5
     ORDER BY w.last_failed_at DESC LIMIT 100`,[actor.organizationId])
  ]);
  return {shares:shares.rows,redemptions:events.rows,security:security.rows,notice:SHARE_NOTICE};
 });}
 async create(actor:UserAuth,sid:string,input:unknown){
  const x=checked(()=>assertShareInput(input));
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   await lock(tx,actor.organizationId,x.reportId);
   await checkedReport(tx,actor.organizationId,x.reportId);
   const {accessToken,accessCode}=newShareSecrets();const id=uid();
   await tx.query(`INSERT INTO report_recipient_shares
     (id,organization_id,report_id,recipient_label,reason,token_sha256,code_sha256,expires_hours,max_downloads,proposed_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id,actor.organizationId,x.reportId,x.recipientLabel,x.reason,shareSecretHash('TOKEN',accessToken),shareSecretHash('CODE',accessCode),x.expiresHours,x.maxDownloads,actor.id]);
   await this.audit.write(tx,actor,'REPORT_SHARE_PROPOSED','report_recipient_share',id,
    {reportId:x.reportId,expiresHours:x.expiresHours,maxDownloads:x.maxDownloads});
   // Credentials appear once and are NOT persisted in plaintext, audited, placed in URLs or emailed by the server.
   return {id,status:'PENDING',accessToken,accessCode,notice:'Credentials shown once. Transfer the link token and second access code separately. An independent current administrator must approve this share before use.'};
  });
 }
 async decide(actor:UserAuth,sid:string,idInput:string,body:unknown){
  const id=checked(()=>isUuid(idInput));const b=checked(()=>strictObject(body,['decision']));const decision=checked(()=>assertDecision(b.decision));
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows:initial}=await tx.query('SELECT report_id FROM report_recipient_shares WHERE id=$1 AND organization_id=$2',[id,actor.organizationId]);
   if(initial.length!==1)throw new NotFoundException('Share request not found');
   await lock(tx,actor.organizationId,initial[0].report_id);
   const {rows}=await tx.query('SELECT * FROM report_recipient_shares WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,actor.organizationId]);
   const p=rows[0];if(!p||p.status!=='PENDING')throw new ConflictException('Share request has already been reviewed');
   if(p.proposed_by===actor.id)throw new ForbiddenException('Independent administrator approval is mandatory');
   const owner=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE`,[p.proposed_by,actor.organizationId]);
   if(owner.rows.length!==1)throw new ForbiddenException('Proposing administrator is no longer active');
   if(decision==='APPROVE')await checkedReport(tx,actor.organizationId,p.report_id);
   await tx.query(`UPDATE report_recipient_shares SET status=$3,reviewed_by=$4,reviewed_at=now(),
      expires_at=CASE WHEN $3='ACTIVE' THEN now() + (expires_hours * interval '1 hour') ELSE NULL END
      WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId,decision==='APPROVE'?'ACTIVE':'REJECTED',actor.id]);
   await this.audit.write(tx,actor,decision==='APPROVE'?'REPORT_SHARE_APPROVED':'REPORT_SHARE_REJECTED','report_recipient_share',id,{reportId:p.report_id});
   return {id,status:decision==='APPROVE'?'ACTIVE':'REJECTED'};
  });
 }
 async revoke(actor:UserAuth,sid:string,idInput:string,body:unknown){
  const id=checked(()=>isUuid(idInput));const b=checked(()=>strictObject(body,['reason']));const why=checked(()=>assertRevocationReason(b.reason));
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows}=await tx.query('SELECT id,report_id,status FROM report_recipient_shares WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,actor.organizationId]);
   if(!rows.length)throw new NotFoundException('Recipient share not found');
   if(rows[0].status!=='ACTIVE')throw new ConflictException('Only active shares can be revoked');
   await tx.query(`UPDATE report_recipient_shares SET status='REVOKED',revoked_by=$3,revoked_at=now(),revocation_reason=$4
     WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId,actor.id,why]);
   await this.audit.write(tx,actor,'REPORT_SHARE_REVOKED','report_recipient_share',id,{reportId:rows[0].report_id});
   return {id,status:'REVOKED'};
  });
 }
 /** This is a capability redemption, NOT proof of recipient identity. Never accept tokens in a GET URL. */
 async redeem(body:unknown){
  let b:Record<string,unknown>;
  try{b=strictObject(body,['shareId','accessToken','accessCode']);if(typeof b.shareId!=='string')throw Error();b.shareId=isUuid(b.shareId);}
  catch{throw unavailable();}
  const result=await this.db.transaction(async tx=>{
   const {rows}=await tx.query('SELECT * FROM report_recipient_shares WHERE id=$1 FOR UPDATE',[b.shareId]);
   if(rows.length!==1)return null;const p=rows[0];
   // The share row lock serializes concurrent attempts at this known share across all API nodes.
   // PostgreSQL time is authoritative even when application server clocks disagree.
   const {rows:windows}=await tx.query(`SELECT window_started_at,failed_count,now() AS checked_at
     FROM report_share_access_windows WHERE share_id=$1 AND organization_id=$2 FOR UPDATE`,[p.id,p.organization_id]);
   const databaseNow=windows.length?new Date(windows[0].checked_at):new Date((await tx.query('SELECT now() AS checked_at')).rows[0].checked_at);
   if(attemptBlocked(windows[0]||null,databaseNow))return null;
   if(!matchShareSecrets(b.accessToken,b.accessCode,p.token_sha256,p.code_sha256)){
    // Return denial as a value so this write COMMITS; throwing here would roll back the counter.
    await tx.query(`INSERT INTO report_share_access_windows
     (share_id,organization_id,window_started_at,failed_count,last_failed_at) VALUES($1,$2,now(),1,now())
     ON CONFLICT (share_id) DO UPDATE SET
      window_started_at=CASE WHEN report_share_access_windows.window_started_at<=now()-interval '15 minutes'
       THEN now() ELSE report_share_access_windows.window_started_at END,
      failed_count=CASE WHEN report_share_access_windows.window_started_at<=now()-interval '15 minutes'
       THEN 1 ELSE LEAST(10,report_share_access_windows.failed_count+1) END,
      last_failed_at=now()`,[p.id,p.organization_id]);
    return null;
   }
   try{assertRedeemable(p);}catch{throw unavailable()}
   // Share-specific advisory lock and report/case row locks limit concurrent eligibility changes.
   await lock(tx,p.organization_id,p.report_id);
   let r:any;try{r=await checkedReport(tx,p.organization_id,p.report_id)}catch{throw unavailable()}
   const keyId=process.env.ASSETTRUST_REPORT_SIGNING_KEY_ID;
   const secret=process.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;
   if(!keyId||!secret)throw new ServiceUnavailableException('Report signing is not configured');
   await setTenantScope(tx,p.organization_id);
   const {rows:layouts}=await tx.query(`SELECT r.layout,a.revision FROM report_pdf_layout_active a
    JOIN report_pdf_layout_revisions r ON r.organization_id=a.organization_id AND r.revision=a.revision
    WHERE a.organization_id=$1`,[p.organization_id]);
   const layout:ReportPdfLayout|undefined=layouts.length?{...layouts[0].layout,revision:Number(layouts[0].revision)}:undefined;
   const payload=makeBundlePayload({reportId:r.id,issuedAt:r.issued_at,snapshotSha256:r.snapshot_sha256,snapshot:r.snapshot,statusAtExport:'ISSUED'});
   let pdf:Buffer,receipt:ReturnType<typeof signPdfReceipt>;
   try{pdf=renderPrivateReportPdf(payload,layout);receipt=signPdfReceipt(payload,pdf,keyId,secret)}catch{throw new ServiceUnavailableException('Unable to render signed PDF')}
   const id=uid();
   await tx.query(`INSERT INTO report_share_redemptions(id,organization_id,share_id,report_id,pdf_sha256,signing_key_id)
    VALUES($1,$2,$3,$4,$5,$6)`,[id,p.organization_id,p.id,p.report_id,receipt.payload.pdfSha256,keyId]);
   await tx.query('UPDATE report_recipient_shares SET download_count=download_count+1 WHERE id=$1 AND organization_id=$2',[p.id,p.organization_id]);
   return {schema:'ASSETTRUST_RECIPIENT_PDF_V1',pdfBase64:pdf.toString('base64'),receipt,
     notice:'Private non-official evidence. This redemption was counted. The PDF signature receipt must be verified with an independently trusted public key; check current public verification status before relying on this report.'};
  });
  if(result===null)throw unavailable();
  return result;
 }
}
@Controller('reports/shares')@UseGuards(AuthGuard)
export class ReportSharingAdminController{
 constructor(private readonly service:ReportSharingService){}
 @Get()list(@Req()r:any){return this.service.list(r.user,r.sessionId)}
 @Post()create(@Req()r:any,@Body()b:unknown){return this.service.create(r.user,r.sessionId,b)}
 @Post(':id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()b:unknown){return this.service.decide(r.user,r.sessionId,id,b)}
 @Post(':id/revoke')revoke(@Req()r:any,@Param('id')id:string,@Body()b:unknown){return this.service.revoke(r.user,r.sessionId,id,b)}
}
@Controller('reports/recipient')
export class ReportRecipientController{
 constructor(private readonly service:ReportSharingService){}
 @Post('redeem')@Throttle({default:{limit:5,ttl:60000}})@Header('Cache-Control','no-store')@Header('Referrer-Policy','no-referrer')
 redeem(@Body()b:unknown){return this.service.redeem(b)}
}
@Module({imports:[AuthModule,AuditModule],providers:[ReportSharingService],controllers:[ReportSharingAdminController,ReportRecipientController]})
export class ReportSharingModule{}
