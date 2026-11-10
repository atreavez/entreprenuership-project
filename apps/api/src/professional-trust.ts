/** TRANSPORT: validation, authorization and HTTP endpoints. Trust policy/use case live below this layer. */
import {Body,Controller,Get,Post,Param,Req,UseGuards,Injectable,Module,BadRequestException,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {Database} from './database';
import {AuthGuard,AuthModule} from './auth';
import {AuditModule,AuditService} from './audit';
import {UserAuth,isUuid,uid,text,optionalText} from './common';
import {TrustPolicyError,canSubmitProfession,validateLicenceExpiry,validateExternalVerification,TRUST_DISCLAIMER} from './contexts/professional-trust/domain/trust-policy';
import {ReviewProfessionalApplication} from './contexts/professional-trust/application/trust-usecases';
import {PgTrustRepository} from './contexts/professional-trust/infrastructure/pg-trust.repository';
@Injectable()
export class ProfessionalTrustService{
 constructor(private readonly db:Database,private readonly audit:AuditService,private readonly reviews:ReviewProfessionalApplication){}
 private async staff(user:UserAuth,sessionId:string){
  const {rows}=await this.db.query(`SELECT pr.user_id,m.enabled FROM platform_trust_reviewers pr
    JOIN auth_mfa_credentials m ON m.user_id=pr.user_id JOIN users u ON u.id=pr.user_id
    JOIN auth_sessions s ON s.user_id=u.id AND s.id=$2
    WHERE pr.user_id=$1 AND pr.disabled_at IS NULL AND m.enabled=true
    AND s.mfa_verified_at > now()-interval '15 minutes' AND s.revoked_at IS NULL
    AND s.expires_at > now()`,[user.id,sessionId]);
  if(rows.length!==1)throw new ForbiddenException('Active trust appointment and an MFA code verified within 15 minutes are required');
 }
 async my(user:UserAuth){
  const [applications,accreditation,staff]=await Promise.all([
   this.db.query(`SELECT id,professional_role,regulator_name,licence_reference,jurisdiction,licence_expires_at,status,submitted_at,decided_at
     FROM professional_applications WHERE applicant_id=$1 AND organization_id=$2 ORDER BY submitted_at DESC LIMIT 25`,[user.id,user.organizationId]),
   this.db.query(`SELECT professional_role,expires_at,revoked_at,revocation_reason,granted_at FROM professional_accreditations
    WHERE user_id=$1`,[user.id]),
   this.db.query(`SELECT EXISTS(SELECT 1 FROM platform_trust_reviewers pr JOIN auth_mfa_credentials m ON m.user_id=pr.user_id
     WHERE pr.user_id=$1 AND pr.disabled_at IS NULL AND m.enabled=true) AS active`,[user.id])
  ]);
  const a=accreditation.rows[0];return {role:user.role,professionalApproved:user.professionalApproved,applications:applications.rows,
    accreditation:a?{...a,active:user.professionalApproved}:null,isTrustReviewer:staff.rows[0]?.active||false,notice:TRUST_DISCLAIMER};
 }
 async submit(user:UserAuth,b:any){
  if(!canSubmitProfession(user.role,user.role))throw new ForbiddenException('Use an invited SURVEYOR or LEGAL_REVIEWER account. Organization administrators cannot self-accredit.');
  const licenceReference=text(b?.licenceReference,'licenceReference',120);const regulatorName=text(b?.regulatorName,'regulatorName',150);
  const jurisdiction=text(b?.jurisdiction||'Uganda','jurisdiction',80);
  const explanation=text(b?.explanation,'explanation',2000);if(explanation.length<30)throw new BadRequestException('Explain the accreditation claim in at least 30 characters');
  const expiresText=text(b?.licenceExpiresAt,'licenceExpiresAt',40);let expiry:number;
  try{expiry=validateLicenceExpiry(expiresText,Date.now())}catch(e:any){throw new BadRequestException(e.message)}
  const documentId=b?.supportingDocumentId?isUuid(b.supportingDocumentId):null;
  const id=uid();await this.db.transaction(async tx=>{
   const current=await tx.query('SELECT id,role FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE',[user.id,user.organizationId]);
   if(!current.rows[0]||!canSubmitProfession(current.rows[0].role,user.role))throw new ForbiddenException('Role changed');
   if(documentId){const doc=await tx.query(`SELECT id FROM documents WHERE id=$1 AND organization_id=$2 AND uploaded_by=$3`,[documentId,user.organizationId,user.id]);if(!doc.rows.length)throw new ForbiddenException('Supporting file must be your own private upload in this organization');}
   await tx.query(`UPDATE professional_applications SET status='EXPIRED',decided_at=now()
       WHERE applicant_id=$1 AND status='PENDING' AND licence_expires_at<=now()`,[user.id]);
   const active=await tx.query(`SELECT 1 FROM professional_applications WHERE applicant_id=$1 AND status='PENDING'`,[user.id]);
   if(active.rows.length)throw new ConflictException('A review is already pending');
   await tx.query(`INSERT INTO professional_applications(id,applicant_id,organization_id,professional_role,regulator_name,licence_reference,jurisdiction,licence_expires_at,supporting_document_id,explanation)
      VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),$9,$10)`,[id,user.id,user.organizationId,user.role,regulatorName,licenceReference,jurisdiction,expiry,documentId,explanation]);
   await this.audit.write(tx,user,'PROFESSIONAL_APPLICATION_SUBMITTED','professional_application',id,{role:user.role,regulator:regulatorName});
  });return {id,status:'PENDING',notice:TRUST_DISCLAIMER};
 }
 async withdraw(user:UserAuth,id:string){isUuid(id);
  await this.db.transaction(async tx=>{
   const result=await tx.query(`UPDATE professional_applications SET status='WITHDRAWN',decided_at=now()
      WHERE id=$1 AND applicant_id=$2 AND organization_id=$3 AND status='PENDING' RETURNING id`,[id,user.id,user.organizationId]);
   if(!result.rows.length)throw new NotFoundException('Pending application not found');
   await this.audit.write(tx,user,'PROFESSIONAL_APPLICATION_WITHDRAWN','professional_application',id,{});
  });return {ok:true,status:'WITHDRAWN'};
 }
 async reviewQueue(user:UserAuth,sessionId:string){await this.staff(user,sessionId);
  const {rows}=await this.db.query(`SELECT a.id,a.professional_role,a.regulator_name,a.licence_reference,a.jurisdiction,a.licence_expires_at,a.explanation,
   a.submitted_at,u.full_name AS applicant_name,o.name AS organization_name,
   (SELECT COUNT(*)::int FROM professional_review_decisions d WHERE d.application_id=a.id) AS review_count
   FROM professional_applications a JOIN users u ON u.id=a.applicant_id JOIN organizations o ON o.id=a.organization_id
   WHERE a.status='PENDING' AND a.organization_id<>$1 AND a.applicant_id<>$2 AND a.licence_expires_at>now()
   AND NOT EXISTS(SELECT 1 FROM professional_review_decisions d WHERE d.application_id=a.id AND d.reviewer_id=$2)
   ORDER BY a.submitted_at LIMIT 100`,[user.organizationId,user.id]);
  return {items:rows,notice:'Claims only. Verify with the regulator independently before attesting. Uploaded private documents are not exposed to platform reviewers.'};
 }
 async attest(user:UserAuth,sessionId:string,id:string,b:any){await this.staff(user,sessionId);isUuid(id);
  const decision=b?.decision;
  if(decision!=='VERIFIED'&&decision!=='REJECTED')throw new BadRequestException('Decision must be VERIFIED or REJECTED');
  const method=text(b?.verificationMethod,'verificationMethod',240);
  const reference=text(b?.verificationReference,'verificationReference',240);
  const notes=text(b?.reviewerNotes,'reviewerNotes',3000);
  try{validateExternalVerification(method,reference,notes)}catch(e:any){throw new BadRequestException(e.message)}
  try{return await this.reviews.execute({id:user.id,organizationId:user.organizationId,sessionId,appointed:true,active:true,mfaEnabled:true},id,decision,method,reference,notes)}catch(e:any){
   if(e instanceof TrustPolicyError){if(e.code==='NOT_FOUND')throw new NotFoundException(e.message);if(e.code==='NOT_ALLOWED')throw new ForbiddenException(e.message);throw new BadRequestException(e.message)}throw e;
  }
 }
 async revoke(user:UserAuth,sessionId:string,userId:string,b:any){await this.staff(user,sessionId);isUuid(userId);
  const reason=text(b?.reason,'reason',1200);if(reason.length<25)throw new BadRequestException('Detailed, documented reason required (25+ characters)');
  await this.db.transaction(async tx=>{
   const authorized=await tx.query(`SELECT 1 FROM platform_trust_reviewers pr JOIN auth_mfa_credentials m ON m.user_id=pr.user_id
     JOIN auth_sessions s ON s.user_id=pr.user_id AND s.id=$2
     WHERE pr.user_id=$1 AND pr.disabled_at IS NULL AND m.enabled=true
     AND s.revoked_at IS NULL AND s.expires_at > now()
     AND s.mfa_verified_at > now()-interval '15 minutes' FOR SHARE OF pr,m,s`,[user.id,sessionId]);
   if(!authorized.rows.length)throw new ForbiddenException('Recent MFA verification is required');
   const own=await tx.query('SELECT organization_id FROM users WHERE id=$1',[userId]);if(!own.rows.length)throw new NotFoundException('Professional not found');
   if(own.rows[0].organization_id===user.organizationId||user.id===userId)throw new ForbiddenException('Cannot revoke your own organization credentials');
   const result=await tx.query(`UPDATE professional_accreditations SET revoked_at=now(),revocation_reason=$2
     WHERE user_id=$1 AND revoked_at IS NULL RETURNING user_id`,[userId,reason]);
   if(!result.rows.length)throw new ConflictException('No active accreditation to revoke');
   await tx.query('UPDATE users SET professional_approved=false WHERE id=$1',[userId]);
   await this.audit.write(tx,{...user,organizationId:own.rows[0].organization_id},'PROFESSIONAL_ACCREDITATION_REVOKED','user',userId,{trustReviewerId:user.id,reason});
  });return {ok:true,notice:'Professional privileges withdrawn immediately for newly authorized requests. Review in-progress evidence separately.'};
 }
}
@Controller('professional')@UseGuards(AuthGuard)
export class ProfessionalTrustController{
 constructor(private readonly svc:ProfessionalTrustService){}
 @Get('me')my(@Req()r:any){return this.svc.my(r.user)}
 @Throttle({default:{limit:3,ttl:60000}})@Post('applications')submit(@Req()r:any,@Body()b:any){return this.svc.submit(r.user,b)}
 @Post('applications/:id/withdraw')withdraw(@Req()r:any,@Param('id')id:string){return this.svc.withdraw(r.user,id)}
 @Get('review-queue')queue(@Req()r:any){return this.svc.reviewQueue(r.user,r.sessionId)}
 @Throttle({default:{limit:10,ttl:60000}})@Post('applications/:id/attest')attest(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.attest(r.user,r.sessionId,id,b)}
 @Throttle({default:{limit:5,ttl:60000}})@Post('users/:id/revoke')revoke(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.svc.revoke(r.user,r.sessionId,id,b)}
}
@Module({imports:[AuthModule,AuditModule],providers:[PgTrustRepository,{provide:ReviewProfessionalApplication,useFactory:(r:PgTrustRepository)=>new ReviewProfessionalApplication(r),inject:[PgTrustRepository]},ProfessionalTrustService],controllers:[ProfessionalTrustController]})
export class ProfessionalTrustModule{}
