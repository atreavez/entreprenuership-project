import {Injectable} from '@nestjs/common';
import {Database} from '../../../database';
import {AuditService} from '../../../audit';
import {TrustRepository,TrustTransaction} from '../application/trust-usecases';
import {Application,TrustActor} from '../domain/trust-policy';
import {UserAuth,uid} from '../../../common';
@Injectable()
export class PgTrustRepository implements TrustRepository{
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 transaction<T>(fn:(tx:TrustTransaction)=>Promise<T>):Promise<T>{
  return this.db.transaction(async connection=>{
   const tx:TrustTransaction={
    getApplication:async id=>{
     const {rows}=await connection.query('SELECT * FROM professional_applications WHERE id=$1 FOR UPDATE',[id]);const a=rows[0];
     return a?{id:a.id,applicantId:a.applicant_id,organizationId:a.organization_id,role:a.professional_role,state:a.status,expiresAt:new Date(a.licence_expires_at).getTime()} as Application:null;
    },
    getActor:async(id,sessionId)=>{
     // Lock active appointment, MFA state, and user row together before recording a vote.
     const {rows}=await connection.query(`SELECT u.id,u.organization_id,pr.appointment_reference,m.enabled AS mfa_enabled
       FROM platform_trust_reviewers pr JOIN users u ON u.id=pr.user_id
       JOIN auth_mfa_credentials m ON m.user_id=pr.user_id
       JOIN auth_sessions s ON s.user_id=u.id AND s.id=$2
       WHERE pr.user_id=$1 AND pr.disabled_at IS NULL AND m.enabled=true
       AND s.mfa_verified_at > now()-interval '15 minutes' AND s.revoked_at IS NULL
       AND s.expires_at > now()
       FOR SHARE OF u,pr,m,s`,[id,sessionId]);
     const a=rows[0];return {id,sessionId,organizationId:a?.organization_id||'',appointed:!!a,active:!!a,mfaEnabled:!!a} as TrustActor;
    },
    getReviews:async id=>{const {rows}=await connection.query('SELECT reviewer_id,decision FROM professional_review_decisions WHERE application_id=$1 ORDER BY decided_at',[id]);return rows.map(x=>({reviewerId:x.reviewer_id,decision:x.decision}));},
    saveDecision:async(id,reviewer,decision,method,reference,notes)=>{
     await connection.query(`INSERT INTO professional_review_decisions(id,application_id,reviewer_id,decision,verification_method,verification_reference,reviewer_notes)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[uid(),id,reviewer,decision,method,reference,notes]);
    },
    finalize:async(app,outcome)=>{
     await connection.query('UPDATE professional_applications SET status=$2,decided_at=now() WHERE id=$1 AND status=$3',[app.id,outcome,'PENDING']);
     if(outcome==='APPROVED'){
      await connection.query(`INSERT INTO professional_accreditations(user_id,application_id,professional_role,expires_at,revoked_at,revocation_reason)
      VALUES($1,$2,$3,to_timestamp($4/1000.0),NULL,NULL)
      ON CONFLICT(user_id) DO UPDATE SET application_id=EXCLUDED.application_id,professional_role=EXCLUDED.professional_role,
      expires_at=EXCLUDED.expires_at,revoked_at=NULL,revocation_reason=NULL,granted_at=now()`,[app.applicantId,app.id,app.role,app.expiresAt]);
      await connection.query(`UPDATE users SET professional_approved=(role=$2) WHERE id=$1 AND organization_id=$3`,[app.applicantId,app.role,app.organizationId]);
     }
    },
    audit:async(app,reviewer,decision,outcome)=>{
     // External reviewer ID is attributable while the event belongs to the applicant organization's audit chain.
     const auditActor:UserAuth={id:reviewer,organizationId:app.organizationId,role:'REVIEWER',email:'',fullName:'Platform trust reviewer',professionalApproved:false};
     await this.audit.write(connection,auditActor,'PROFESSIONAL_ATTESTATION','professional_application',app.id,{decision,outcome,reviewerId:reviewer,role:app.role});
    }
   };return fn(tx);
  });
 }
}
