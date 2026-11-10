/** DOMAIN: pure professional accreditation policies. NO framework/database/time calls. */
export type ProfessionalRole='SURVEYOR'|'LEGAL_REVIEWER';
export type ProfessionalState='PENDING'|'APPROVED'|'REJECTED'|'WITHDRAWN'|'EXPIRED';
export type TrustActor={id:string;organizationId:string;sessionId:string;mfaEnabled:boolean;appointed:boolean;active:boolean};
export type Application={id:string;applicantId:string;organizationId:string;role:ProfessionalRole;state:ProfessionalState;expiresAt:number};
export type Attestation={reviewerId:string;decision:'VERIFIED'|'REJECTED'};
export type TrustOutcome='PENDING'|'APPROVED'|'REJECTED';
export class TrustPolicyError extends Error {constructor(readonly code:string,message:string){super(message);this.name='TrustPolicyError';}}
export function professionalRole(role:string):role is ProfessionalRole{return role==='SURVEYOR'||role==='LEGAL_REVIEWER'}
export function canSubmitProfession(role:string,requested:string){return professionalRole(role)&&role===requested}
export function canAttest(actor:TrustActor,app:Application,prior:Attestation[],now:number){
 return actor.appointed&&actor.active&&actor.mfaEnabled&&actor.id!==app.applicantId&&
 actor.organizationId!==app.organizationId&&app.state==='PENDING'&&app.expiresAt>now&&
 !prior.some(x=>x.reviewerId===actor.id);
}
/** Two independent appointed reviewers must verify the original claim; one rejection blocks approval. */
export function resolveAttestations(reviews:Attestation[]):TrustOutcome{
 if(reviews.some(x=>x.decision==='REJECTED'))return 'REJECTED';
 return new Set(reviews.filter(x=>x.decision==='VERIFIED').map(x=>x.reviewerId)).size>=2?'APPROVED':'PENDING';
}
export function isLiveAccreditation(role:string,record:{role:string;expiresAt:number;revokedAt?:number|null}|null,now:number){
 return professionalRole(role)&&!!record&&record.role===role&&!record.revokedAt&&record.expiresAt>now;
}
export function validateLicenceExpiry(date:string,now:number){const expires=Date.parse(date);if(!Number.isFinite(expires)||expires<=now+86400000||expires>now+10*365*86400000)throw new TrustPolicyError('INVALID_EXPIRY','Licence expiry must be at least one day in the future and within ten years');return expires;}
export function validateExternalVerification(method:string,reference:string,notes:string){
 if(method.trim().length<12||reference.trim().length<8||notes.trim().length<20)throw new TrustPolicyError('INADEQUATE_VERIFICATION','Record a meaningful independent check method (12+), authoritative reference (8+) and evidence-based notes (20+)');
 if(method.length>240||reference.length>240||notes.length>3000)throw new TrustPolicyError('VERIFICATION_TOO_LONG','Verification details exceed allowed size');
}
export const TRUST_DISCLAIMER='Internal accreditation following documented manual checks. Not government endorsement, a licensing authority certificate, or a substitute for a current official licence search.';
