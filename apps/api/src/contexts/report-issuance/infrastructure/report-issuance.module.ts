import {Body,Controller,Get,Post,Param,Req,Header,UseGuards,Injectable,Module,NotFoundException,BadRequestException,ForbiddenException,ConflictException,ServiceUnavailableException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {Database} from '../../../database';
import {setTenantScope} from '../../tenant-isolation/application/tenant-scope';
import {AuthGuard,AuthModule} from '../../../auth';
import {AuditModule,AuditService} from '../../../audit';
import {uid,isUuid,type UserAuth} from '../../../common';
import {PublishedContentModule,PublishedContentService} from '../../content-publishing/infrastructure/published-content.module';
import {assertCurrentAdminStepUp} from '../../identity/infrastructure/current-admin-step-up';
import {assertReportIssuable,prepareSnapshot,canonicalSnapshot,assertVerificationToken,publicVerification,assertWithdrawalReason,type IssuableCase,type IssuableEvidence} from '../domain/report-policy';
import {makeBundlePayload,signBundle,publicKeyDescription,type StatusAtExport} from '../domain/signed-attestation';
import {renderPrivateReportPdf,signPdfReceipt} from '../domain/signed-pdf';
import type {ReportPdfLayout} from '../domain/report-layout-policy';

const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const invalid=(error:unknown):never=>{throw new BadRequestException(error instanceof Error?error.message:'Invalid report issuance input')};
function reason(value:unknown):string{
 if(typeof value!=='string'||value.trim().length<12||value.length>500||/[<>\x00-\x1f\x7f]/.test(value))throw new BadRequestException('Reason must be 12–500 characters of plain text');
 return value.trim();
}
function decision(value:unknown):'APPROVE'|'REJECT'{if(value!=='APPROVE'&&value!=='REJECT')throw new BadRequestException('Unsupported report issuance decision');return value;}
function strictFields(value:any,allowed:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new BadRequestException('Unsupported report issuance field');}
/** Only read public verification data from the append-only issued-report table. */
@Injectable()
export class ReportIssuanceService {
 constructor(private readonly db:Database,private readonly audit:AuditService,private readonly published:PublishedContentService){}
 private async currentCase(tx:PoolClient,u:UserAuth,caseId:string){
  await setTenantScope(tx,u.organizationId);
  const result=await tx.query(`SELECT c.id,c.organization_id AS "organizationId",c.asset_id AS "assetId",
    c.case_code AS "caseCode",a.asset_code AS "assetCode",c.stage,c.status,o.name AS "organizationName"
   FROM verification_cases c JOIN assets a ON a.id=c.asset_id AND a.organization_id=c.organization_id
   JOIN organizations o ON o.id=c.organization_id
   WHERE c.id=$1 AND c.organization_id=$2 FOR UPDATE OF c`,[caseId,u.organizationId]);
  if(result.rows.length!==1)throw new NotFoundException('Verification case not found');
  return result.rows[0] as IssuableCase;
 }
 private async snapshot(tx:PoolClient,u:UserAuth,caseId:string){
  await setTenantScope(tx,u.organizationId);
  const c=await this.currentCase(tx,u,caseId);
  const {rows:items}=await tx.query(`SELECT id,stage,evidence_type,review_status,recorded_by,reviewed_by,
    source_name,reference,observations FROM case_evidence
    WHERE case_id=$1 AND organization_id=$2 ORDER BY created_at,id`,[caseId,u.organizationId]);
  const {rows:disputes}=await tx.query(`SELECT count(*)::int AS total FROM disputes WHERE case_id=$1
    AND organization_id=$2 AND status IN ('OPEN','INVESTIGATING')`,[caseId,u.organizationId]);
  try{assertReportIssuable(c,items as IssuableEvidence[],Number(disputes[0]?.total||0));}
  catch(error){throw new ConflictException(error instanceof Error?error.message:'Report issuance requirements not met')}
  const copy=await this.published.organization(tx,u.organizationId,'report.summary',{
   case_reference:c.caseCode,asset_reference:c.assetCode,organization_name:c.organizationName});
  let prepared:ReturnType<typeof prepareSnapshot>;
  try{prepared=prepareSnapshot(c,items as IssuableEvidence[],0,copy)}catch(e){return invalid(e)}
  const snapshot=canonicalSnapshot(prepared);
  return {snapshot:prepared,digest:sha(snapshot)};
 }
 private async lastIssued(tx:PoolClient,u:UserAuth,caseId:string){
  const {rows}=await tx.query(`SELECT r.id FROM issued_verification_reports r
   WHERE r.organization_id=$1 AND r.case_id=$2
     AND NOT EXISTS(SELECT 1 FROM issued_verification_reports successor
        WHERE successor.supersedes_report_id=r.id)
   ORDER BY r.issued_at DESC LIMIT 1 FOR SHARE OF r`,[u.organizationId,caseId]);
  return rows[0]?.id as string|undefined;
 }
 async list(actor:UserAuth,sid:string){return this.db.transaction(async tx=>{
  await assertCurrentAdminStepUp(tx,actor,sid);
  const [pending,issued,withdrawalProposals,withdrawals]=await Promise.all([
   tx.query(`SELECT id,case_id,reason,proposed_by,proposed_at,status,supersedes_report_id
      FROM report_issuance_proposals WHERE organization_id=$1 ORDER BY proposed_at DESC LIMIT 100`,[actor.organizationId]),
   tx.query(`SELECT id,case_id,snapshot_sha256,issued_at,issued_by,supersedes_report_id
      FROM issued_verification_reports WHERE organization_id=$1 ORDER BY issued_at DESC LIMIT 100`,[actor.organizationId]),
   tx.query(`SELECT id,report_id,reason,proposed_by,proposed_at,status,decided_by,decided_at
      FROM report_withdrawal_proposals WHERE organization_id=$1 ORDER BY proposed_at DESC LIMIT 100`,[actor.organizationId]),
   tx.query(`SELECT id,report_id,approved_at,approved_by FROM issued_report_withdrawals
      WHERE organization_id=$1 ORDER BY approved_at DESC LIMIT 100`,[actor.organizationId])
  ]);
  return {proposals:pending.rows,issued:issued.rows,withdrawalProposals:withdrawalProposals.rows,withdrawals:withdrawals.rows,notice:'All issued reports are private non-official evidence records. Public QR verification shows only reference, status and SHA-256 digest.'};
 });}
 async propose(actor:UserAuth,sid:string,input:any){
  strictFields(input,['caseId','supersedesReportId','reason']);
  const caseId=isUuid(input.caseId),why=reason(input.reason),previous=input.supersedesReportId?isUuid(input.supersedesReportId):null;
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:report:${actor.organizationId}:${caseId}`]);
   const {snapshot,digest}=await this.snapshot(tx,actor,caseId);
   const latest=await this.lastIssued(tx,actor,caseId);
   if((latest||null)!==previous)throw new ConflictException('A previously issued report must be explicitly superseded; reload issuance history');
   const pending=await tx.query(`SELECT id FROM report_issuance_proposals WHERE organization_id=$1 AND case_id=$2 AND status='PENDING' FOR UPDATE`,[actor.organizationId,caseId]);
   if(pending.rows.length)throw new ConflictException('A report issuance is already awaiting independent review');
   const id=uid();
   await tx.query(`INSERT INTO report_issuance_proposals
     (id,organization_id,case_id,prepared_snapshot,snapshot_sha256,supersedes_report_id,reason,proposed_by)
     VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
     [id,actor.organizationId,caseId,canonicalSnapshot(snapshot),digest,previous,why,actor.id]);
   await this.audit.write(tx,actor,'REPORT_ISSUANCE_PROPOSED','report_proposal',id,{caseId,snapshotSha256:digest,supersedesReportId:previous});
   return {id,status:'PENDING',snapshotSha256:digest,notice:'This is a private issuance proposal; it is not a government land-title certification.'};
  });
 }
 async decide(actor:UserAuth,sid:string,idInput:string,input:any){
  strictFields(input,['decision']);const id=isUuid(idInput),vote=decision(input.decision);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows:initial}=await tx.query(`SELECT case_id FROM report_issuance_proposals WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId]);
   if(initial.length!==1)throw new NotFoundException('Report proposal not found');
   const caseId=initial[0].case_id as string;
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:report:${actor.organizationId}:${caseId}`]);
   // Lock case first, then pending proposal. This serializes issuance with case mutations.
   await this.currentCase(tx,actor,caseId);
   const {rows}=await tx.query(`SELECT * FROM report_issuance_proposals WHERE id=$1 AND organization_id=$2 AND case_id=$3 FOR UPDATE`,[id,actor.organizationId,caseId]);
   const p=rows[0];if(!p||p.status!=='PENDING')throw new ConflictException('Report issuance already decided');
   if(p.proposed_by===actor.id)throw new ForbiddenException('Independent administrator approval is mandatory');
   const proposer=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN' AND suspended_at IS NULL FOR SHARE`,[p.proposed_by,actor.organizationId]);
   if(proposer.rows.length!==1)throw new ForbiddenException('Proposing administrator is no longer authorized');
   let reportId:string|null=null;
   if(vote==='APPROVE'){
    const current=await this.snapshot(tx,actor,caseId);
    if(current.digest!==p.snapshot_sha256||sha(canonicalSnapshot(p.prepared_snapshot))!==p.snapshot_sha256)
     throw new ConflictException('Source evidence or published report template changed; create a new proposal');
    const latest=await this.lastIssued(tx,actor,caseId);
    if((latest||null)!==(p.supersedes_report_id||null))throw new ConflictException('Another report was issued; create a new proposal');
    reportId=uid();
    await tx.query(`INSERT INTO issued_verification_reports
       (id,organization_id,case_id,proposal_id,snapshot,snapshot_sha256,supersedes_report_id,issued_by)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [reportId,actor.organizationId,caseId,id,canonicalSnapshot(current.snapshot),current.digest,p.supersedes_report_id,actor.id]);
   }
   await tx.query(`UPDATE report_issuance_proposals SET status=$3,decided_by=$4,decided_at=now(),issued_report_id=$5
    WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId,vote==='APPROVE'?'ISSUED':'REJECTED',actor.id,reportId]);
   await this.audit.write(tx,actor,vote==='APPROVE'?'REPORT_ISSUED':'REPORT_ISSUANCE_REJECTED','report_proposal',id,
    {caseId,reportId,snapshotSha256:p.snapshot_sha256,supersedesReportId:p.supersedes_report_id||null});
   return {proposalId:id,status:vote==='APPROVE'?'ISSUED':'REJECTED',reportId,
    verificationPath:reportId?`/#verify/report/${reportId}`:null,
    notice:'AssetTrust private evidence only. No digital signature, official registry endorsement, or ownership certificate has been issued.'};
  });
 }
 /** Emergency safety action: two current organization admins, independent fresh MFA.
  * Withdrawal never modifies an issued snapshot or leaks the confidential reason publicly.
  */
 async proposeWithdrawal(actor:UserAuth,sid:string,input:any){
  strictFields(input,['reportId','reason']);
  const reportId=isUuid(input.reportId);
  let why:string;try{why=assertWithdrawalReason(input.reason)}catch(e){return invalid(e)}
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:withdraw:${actor.organizationId}:${reportId}`]);
   const {rows}=await tx.query(`SELECT id FROM issued_verification_reports
     WHERE id=$1 AND organization_id=$2 FOR SHARE`,[reportId,actor.organizationId]);
   if(rows.length!==1)throw new NotFoundException('Issued report not found');
   const prior=await tx.query(`SELECT id FROM issued_report_withdrawals WHERE report_id=$1 AND organization_id=$2`,[reportId,actor.organizationId]);
   if(prior.rows.length)throw new ConflictException('This issued report has already been withdrawn');
   const pending=await tx.query(`SELECT id FROM report_withdrawal_proposals WHERE report_id=$1 AND organization_id=$2
      AND status='PENDING' FOR UPDATE`,[reportId,actor.organizationId]);
   if(pending.rows.length)throw new ConflictException('Another withdrawal proposal is awaiting independent review');
   const id=uid();
   await tx.query(`INSERT INTO report_withdrawal_proposals
     (id,organization_id,report_id,reason,proposed_by) VALUES($1,$2,$3,$4,$5)`,
      [id,actor.organizationId,reportId,why,actor.id]);
   await this.audit.write(tx,actor,'REPORT_WITHDRAWAL_PROPOSED','report_withdrawal_proposal',id,{reportId});
   return {id,status:'PENDING',notice:'Awaiting an independent administrator decision; the original report has not been withdrawn yet.'};
  });
 }
 async decideWithdrawal(actor:UserAuth,sid:string,idInput:string,input:any){
  strictFields(input,['decision']);const id=isUuid(idInput),vote=decision(input.decision);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows:initial}=await tx.query(`SELECT report_id FROM report_withdrawal_proposals
      WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId]);
   if(initial.length!==1)throw new NotFoundException('Withdrawal proposal not found');
   const reportId=initial[0].report_id as string;
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`assettrust:withdraw:${actor.organizationId}:${reportId}`]);
   const {rows}=await tx.query(`SELECT * FROM report_withdrawal_proposals
      WHERE id=$1 AND organization_id=$2 AND report_id=$3 FOR UPDATE`,[id,actor.organizationId,reportId]);
   const p=rows[0];if(!p||p.status!=='PENDING')throw new ConflictException('Withdrawal proposal already decided');
   if(p.proposed_by===actor.id)throw new ForbiddenException('A different administrator must approve or reject withdrawal');
   const proposer=await tx.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='ORG_ADMIN'
     AND suspended_at IS NULL FOR SHARE`,[p.proposed_by,actor.organizationId]);
   if(proposer.rows.length!==1)throw new ForbiddenException('Proposing administrator is no longer authorized');
   const report=await tx.query(`SELECT id FROM issued_verification_reports WHERE id=$1 AND organization_id=$2 FOR SHARE`,[reportId,actor.organizationId]);
   if(report.rows.length!==1)throw new NotFoundException('Issued report not found');
   let withdrawalId:string|null=null;
   if(vote==='APPROVE'){
    const existing=await tx.query(`SELECT id FROM issued_report_withdrawals WHERE report_id=$1 AND organization_id=$2`,[reportId,actor.organizationId]);
    if(existing.rows.length)throw new ConflictException('This report was already withdrawn');
    withdrawalId=uid();
    await tx.query(`INSERT INTO issued_report_withdrawals
      (id,organization_id,report_id,proposal_id,reason,approved_by) VALUES($1,$2,$3,$4,$5,$6)`,
     [withdrawalId,actor.organizationId,reportId,id,p.reason,actor.id]);
   }
   await tx.query(`UPDATE report_withdrawal_proposals SET status=$3,decided_by=$4,decided_at=now(),withdrawal_id=$5
      WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId,vote==='APPROVE'?'APPROVED':'REJECTED',actor.id,withdrawalId]);
   await this.audit.write(tx,actor,vote==='APPROVE'?'REPORT_WITHDRAWN':'REPORT_WITHDRAWAL_REJECTED',
      'report_withdrawal_proposal',id,{reportId,withdrawalId});
   return {proposalId:id,reportId,status:vote==='APPROVE'?'WITHDRAWN':'REJECTED',
    notice:vote==='APPROVE'?'Public verification will now show WITHDRAWN. Original evidence remains preserved.':'Report withdrawal was rejected.'};
  });
 }
 /** v0.36: public signing key only. Consumers MUST independently pin the fingerprint. */
 signingKey(){
  const keyId=process.env.ASSETTRUST_REPORT_SIGNING_KEY_ID;
  const secret=process.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;
  if(!keyId||!secret)throw new ServiceUnavailableException('Report signing is not configured');
  try{return publicKeyDescription(keyId,secret)}
  catch{throw new ServiceUnavailableException('Report signing configuration is invalid')}
 }
 /** An on-demand, signed and auditable export of an existing report. This is NOT an issue-time signature or signed PDF. */
 async signedExport(actor:UserAuth,sid:string,idInput:string){
  const id=isUuid(idInput);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows}=await tx.query(`SELECT r.id,r.snapshot,r.snapshot_sha256,r.issued_at,
    EXISTS(SELECT 1 FROM issued_report_withdrawals w WHERE w.report_id=r.id AND w.organization_id=r.organization_id) AS withdrawn,
    EXISTS(SELECT 1 FROM report_withdrawal_proposals pending WHERE pending.report_id=r.id AND pending.organization_id=r.organization_id AND pending.status='PENDING') AS withdrawal_pending,
    EXISTS(SELECT 1 FROM issued_verification_reports successor WHERE successor.supersedes_report_id=r.id AND successor.organization_id=r.organization_id) AS superseded,
    EXISTS(SELECT 1 FROM verification_cases c WHERE c.id=r.case_id AND c.organization_id=r.organization_id AND c.status<>'CLOSED')
    OR EXISTS(SELECT 1 FROM disputes d WHERE d.case_id=r.case_id AND d.organization_id=r.organization_id AND d.status IN ('OPEN','INVESTIGATING')) AS under_review
    FROM issued_verification_reports r WHERE r.id=$1 AND r.organization_id=$2 FOR SHARE OF r`,[id,actor.organizationId]);
   if(rows.length!==1)throw new NotFoundException('Issued report not found');
   const r=rows[0];
   if(sha(canonicalSnapshot(r.snapshot))!==r.snapshot_sha256)throw new ConflictException('Report integrity failed; cannot export a signed bundle');
   const keyId=process.env.ASSETTRUST_REPORT_SIGNING_KEY_ID;
   const secret=process.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;
   if(!keyId||!secret)throw new ServiceUnavailableException('Report signing is not configured');
   const status:StatusAtExport=r.withdrawn?'WITHDRAWN':r.superseded?'SUPERSEDED':(r.under_review||r.withdrawal_pending)?'UNDER_REVIEW':'ISSUED';
   const payload=makeBundlePayload({reportId:r.id,issuedAt:r.issued_at,snapshotSha256:r.snapshot_sha256,snapshot:r.snapshot,statusAtExport:status});
   let signed:ReturnType<typeof signBundle>;
   try{signed=signBundle(payload,keyId,secret)}catch{throw new ServiceUnavailableException('Report signing configuration is invalid')}
   await this.audit.write(tx,actor,'REPORT_SIGNED_BUNDLE_EXPORTED','issued_report',id,{keyId,statusAtExport:status,exportedAt:payload.exportedAt,snapshotSha256:r.snapshot_sha256});
   return signed;
  });
 }
 /** v0.37: PDF and detached signature receipt. Same tenant, integrity and step-up boundary as signed JSON export.
  * The receipt authenticates these exact PDF bytes. It does not embed a PAdES signature. */
 async pdfExport(actor:UserAuth,sid:string,idInput:string,layout?:ReportPdfLayout){
  const id=isUuid(idInput);
  return this.db.transaction(async tx=>{
   await setTenantScope(tx,actor.organizationId);
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows}=await tx.query(`SELECT r.id,r.snapshot,r.snapshot_sha256,r.issued_at,
    EXISTS(SELECT 1 FROM issued_report_withdrawals w WHERE w.report_id=r.id AND w.organization_id=r.organization_id) AS withdrawn,
    EXISTS(SELECT 1 FROM report_withdrawal_proposals p WHERE p.report_id=r.id AND p.organization_id=r.organization_id AND p.status='PENDING') AS withdrawal_pending,
    EXISTS(SELECT 1 FROM issued_verification_reports successor WHERE successor.supersedes_report_id=r.id AND successor.organization_id=r.organization_id) AS superseded,
    EXISTS(SELECT 1 FROM verification_cases c WHERE c.id=r.case_id AND c.organization_id=r.organization_id AND c.status<>'CLOSED')
    OR EXISTS(SELECT 1 FROM disputes d WHERE d.case_id=r.case_id AND d.organization_id=r.organization_id AND d.status IN ('OPEN','INVESTIGATING')) AS under_review
    FROM issued_verification_reports r WHERE r.id=$1 AND r.organization_id=$2 FOR SHARE OF r`,[id,actor.organizationId]);
   if(rows.length!==1)throw new NotFoundException('Issued report not found');
   const r=rows[0];
   if(sha(canonicalSnapshot(r.snapshot))!==r.snapshot_sha256)throw new ConflictException('Report integrity failed; refusing PDF export');
   const keyId=process.env.ASSETTRUST_REPORT_SIGNING_KEY_ID;
   const secret=process.env.ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64;
   if(!keyId||!secret)throw new ServiceUnavailableException('Report signing is not configured');
   const status:StatusAtExport=r.withdrawn?'WITHDRAWN':r.superseded?'SUPERSEDED':(r.under_review||r.withdrawal_pending)?'UNDER_REVIEW':'ISSUED';
   const payload=makeBundlePayload({reportId:r.id,issuedAt:r.issued_at,snapshotSha256:r.snapshot_sha256,snapshot:r.snapshot,statusAtExport:status});
   let pdf:Buffer;let receipt:ReturnType<typeof signPdfReceipt>;
   try{pdf=renderPrivateReportPdf(payload,layout);receipt=signPdfReceipt(payload,pdf,keyId,secret)}
   catch(e){if(e instanceof Error&&/printable|exceeds|too long/.test(e.message))throw new ConflictException(e.message);throw new ServiceUnavailableException('PDF rendering or signing failed')}
   await this.audit.write(tx,actor,'REPORT_PDF_EXPORTED','issued_report',id,
    {keyId,pdfSha256:receipt.payload.pdfSha256,snapshotSha256:r.snapshot_sha256,statusAtExport:status,exportedAt:payload.exportedAt,layoutRevision:layout?.revision??0});
   return {schema:'ASSETTRUST_PDF_DOWNLOAD_V1' as const,reportId:r.id,pdfBase64:pdf.toString('base64'),receipt,
    notice:'Confidential private evidence. Save the PDF and matching receipt together; verify against an independently trusted public key.'};
  });
 }
 async privateReport(actor:UserAuth,sid:string,idInput:string){
  const id=isUuid(idInput);
  return this.db.transaction(async tx=>{
   await assertCurrentAdminStepUp(tx,actor,sid);
   const {rows}=await tx.query(`SELECT id,case_id,snapshot,snapshot_sha256,issued_by,issued_at,supersedes_report_id
       FROM issued_verification_reports WHERE id=$1 AND organization_id=$2`,[id,actor.organizationId]);
   if(rows.length!==1)throw new NotFoundException('Issued report not found');
   const r=rows[0];return {...r,integrityVerified:sha(canonicalSnapshot(r.snapshot))===r.snapshot_sha256,
    notice:'Private non-official report. Only public verification metadata is available to unauthenticated readers.'};
  });
 }
 async verifyPublic(idInput:string){
  let id:string;try{id=assertVerificationToken(idInput)}catch{throw new NotFoundException('Verification reference not found')}
  return this.db.transaction(async tx=>{
   // The UUID is an opaque public reference. Discover only the tenant ID first;
   // never take a tenant ID from untrusted HTTP input.
   const lookup=await tx.query('SELECT organization_id FROM issued_verification_reports WHERE id=$1',[id]);
   if(lookup.rows.length!==1)throw new NotFoundException('Verification reference not found');
   await setTenantScope(tx,lookup.rows[0].organization_id);
   const {rows}=await tx.query(`SELECT r.id,r.snapshot,r.snapshot_sha256,r.issued_at,
    EXISTS(SELECT 1 FROM issued_report_withdrawals w WHERE w.report_id=r.id AND w.organization_id=r.organization_id) AS withdrawn,
    EXISTS(SELECT 1 FROM report_withdrawal_proposals pending WHERE pending.report_id=r.id AND pending.organization_id=r.organization_id AND pending.status='PENDING') AS withdrawal_pending,
    EXISTS(SELECT 1 FROM issued_verification_reports successor WHERE successor.supersedes_report_id=r.id) AS superseded,
    EXISTS(SELECT 1 FROM verification_cases c WHERE c.id=r.case_id AND c.organization_id=r.organization_id AND c.status<>'CLOSED')
    OR EXISTS(SELECT 1 FROM disputes d WHERE d.case_id=r.case_id AND d.organization_id=r.organization_id AND d.status IN ('OPEN','INVESTIGATING')) AS under_review
    FROM issued_verification_reports r WHERE r.id=$1`,[id]);
  if(rows.length!==1)throw new NotFoundException('Verification reference not found');
  const r=rows[0];const check=sha(canonicalSnapshot(r.snapshot))===r.snapshot_sha256;
  return publicVerification(r,check);
  });
 }
}
@Controller('reports/issued')@UseGuards(AuthGuard)
export class ReportIssuanceController{
 constructor(private readonly svc:ReportIssuanceService){}
 @Get()list(@Req()r:any){return this.svc.list(r.user,r.sessionId)}
 @Post('proposals')propose(@Req()r:any,@Body()b:any){return this.svc.propose(r.user,r.sessionId,b)}
 @Post('proposals/:id/decision')decide(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.decide(r.user,r.sessionId,id,b)}
 @Post('withdrawals')proposeWithdrawal(@Req()r:any,@Body()b:any){return this.svc.proposeWithdrawal(r.user,r.sessionId,b)}
 @Post('withdrawals/:id/decision')decideWithdrawal(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.decideWithdrawal(r.user,r.sessionId,id,b)}
 @Get(':id/signed-export')@Header('Cache-Control','private, no-store')signedExport(@Req()r:any,@Param('id')id:string){return this.svc.signedExport(r.user,r.sessionId,id)}
 @Get(':id/pdf-export')@Header('Cache-Control','private, no-store')pdfExport(@Req()r:any,@Param('id')id:string){return this.svc.pdfExport(r.user,r.sessionId,id)}
 @Get(':id')report(@Req()r:any,@Param('id')id:string){return this.svc.privateReport(r.user,r.sessionId,id)}
}
@Controller('reports')
export class PublicReportVerificationController{
 constructor(private readonly svc:ReportIssuanceService){}
 @Get('verify/signing-key')@Header('Cache-Control','no-store')key(){return this.svc.signingKey()}
 @Get('verify/:id')@Header('Cache-Control','no-store')verify(@Param('id')id:string){return this.svc.verifyPublic(id)}
}
@Module({imports:[AuthModule,AuditModule,PublishedContentModule],providers:[ReportIssuanceService],exports:[ReportIssuanceService],controllers:[ReportIssuanceController,PublicReportVerificationController]})
export class ReportIssuanceModule{}
