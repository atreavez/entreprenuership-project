import {Application,TrustActor,Attestation,TrustPolicyError,canAttest,resolveAttestations,TrustOutcome,TRUST_DISCLAIMER} from '../domain/trust-policy';
/** APPLICATION: orchestration against ports; adapter owns locking, SQL and auditing. */
export interface TrustTransaction{
 getApplication(id:string):Promise<Application|null>;
 getActor(userId:string,sessionId:string):Promise<TrustActor>;
 getReviews(id:string):Promise<Attestation[]>;
 saveDecision(id:string,reviewer:string,decision:'VERIFIED'|'REJECTED',method:string,reference:string,notes:string):Promise<void>;
 finalize(app:Application,outcome:Exclude<TrustOutcome,'PENDING'>,now:number):Promise<void>;
 audit(app:Application,reviewer:string,decision:string,outcome:TrustOutcome):Promise<void>;
}
export interface TrustRepository{transaction<T>(fn:(tx:TrustTransaction)=>Promise<T>):Promise<T>}
export class ReviewProfessionalApplication{
 constructor(private readonly repository:TrustRepository,private readonly clock:()=>number=Date.now){}
 async execute(actor:TrustActor,id:string,decision:'VERIFIED'|'REJECTED',method:string,reference:string,notes:string){
  if(decision!=='VERIFIED'&&decision!=='REJECTED')throw new TrustPolicyError('INVALID_DECISION','Unknown decision');
  return this.repository.transaction(async tx=>{
   const app=await tx.getApplication(id);if(!app)throw new TrustPolicyError('NOT_FOUND','Application does not exist');
   const prior=await tx.getReviews(id);const now=this.clock();
   const verifiedActor=await tx.getActor(actor.id,actor.sessionId);
   if(!canAttest(verifiedActor,app,prior,now))throw new TrustPolicyError('NOT_ALLOWED','Only separate, active, MFA-enabled platform reviewers outside the applicant organization may decide a pending application');
   await tx.saveDecision(id,actor.id,decision,method,reference,notes);
   const outcome=resolveAttestations([...prior,{reviewerId:actor.id,decision}]);
   if(outcome!=='PENDING')await tx.finalize(app,outcome,now);
   await tx.audit(app,actor.id,decision,outcome);
   return {applicationId:id,status:outcome,reviewCount:prior.length+1,notice:TRUST_DISCLAIMER};
  });
 }
}
