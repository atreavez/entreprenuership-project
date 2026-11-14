import {ReviewActor,ReviewDecision,CaseRecord,EvidenceRecord,Readiness,mayReviewEvidence,evaluateReadiness,DISCLAIMER} from '../domain/evidence-policy';
import {defaultWorkflowPolicy,applyWorkflowPolicy,type VersionedWorkflowPolicy} from '../../workflow-admin/domain/workflow-policy';
/** APPLICATION: use cases depend only on repository ports and pure domain rules. */
export class WorkflowFailure extends Error{
 constructor(readonly code:string,message:string){super(message);this.name='WorkflowFailure';}
}
export interface WorkflowTransaction{
 /** Authoritative current-role/trust query, locked within this same transaction. */
 getCurrentActor(actor:ReviewActor,stage:string):Promise<ReviewActor>;
 /** Optional for older in-memory test adapters; production Postgres always implements it. */
 getStagePolicy?(organizationId:string,stage:string):Promise<VersionedWorkflowPolicy>;
 getCase(id:string,orgId:string):Promise<CaseRecord|null>;
 getEvidence(evidenceId:string,caseId:string,orgId:string):Promise<EvidenceRecord|null>;
 getEvidenceForStage(caseId:string,orgId:string,stage:string):Promise<EvidenceRecord[]>;
 hasUnresolvedDispute(caseId:string,orgId:string):Promise<boolean>;
 recordDecision(evidenceId:string,actorId:string,decision:ReviewDecision,notes:string):Promise<void>;
 changeStage(caseId:string,orgId:string,newStage:string,status:string):Promise<void>;
 completeAsset(assetId:string,orgId:string):Promise<void>;
 audit(actor:ReviewActor,action:string,caseId:string,details:Record<string,unknown>):Promise<void>;
}
export interface WorkflowRepository{
 transaction<T>(work:(tx:WorkflowTransaction)=>Promise<T>):Promise<T>;
}
export class EvidenceWorkflow{
 constructor(private readonly repo:WorkflowRepository){}
 private async findCase(tx:WorkflowTransaction,actor:ReviewActor,id:string):Promise<CaseRecord>{
  const c=await tx.getCase(id,actor.organizationId);
  if(!c)throw new WorkflowFailure('CASE_NOT_FOUND','Case not found');return c;
 }
 async review(actor:ReviewActor,caseId:string,evidenceId:string,decision:ReviewDecision,notes:string){
  if(decision!=='ACCEPTED'&&decision!=='REJECTED')throw new WorkflowFailure('INVALID_DECISION','Unknown review decision');
  if(typeof notes!=='string'||notes.trim().length<8||notes.length>2000)throw new WorkflowFailure('INVALID_NOTES','Review rationale must be 8–2000 characters');
  return this.repo.transaction(async tx=>{
   const c=await this.findCase(tx,actor,caseId);
   if(c.status!=='OPEN')throw new WorkflowFailure('CASE_NOT_OPEN','Cannot review a closed or blocked case');
   const current=await tx.getCurrentActor(actor,c.stage);
   if(await tx.hasUnresolvedDispute(caseId,actor.organizationId))throw new WorkflowFailure('DISPUTE_OPEN','Resolve active disputes first');
   const e=await tx.getEvidence(evidenceId,caseId,actor.organizationId);
   if(!e)throw new WorkflowFailure('EVIDENCE_NOT_FOUND','Evidence not found');
   if(!mayReviewEvidence(current,e,c.stage))throw new WorkflowFailure('REVIEW_NOT_AUTHORIZED','Requires a separate authorized reviewer and pending evidence for this stage');
   await tx.recordDecision(evidenceId,actor.id,decision,notes.trim());
   await tx.audit(actor,'EVIDENCE_REVIEWED',caseId,{evidenceId,stage:c.stage,decision,reviewerId:actor.id});
   return {id:evidenceId,decision,reviewedBy:actor.id,notice:DISCLAIMER};
  });
 }
 async readiness(actor:ReviewActor,caseId:string):Promise<Readiness>{
  return this.repo.transaction(async tx=>{
   const c=await this.findCase(tx,actor,caseId);
   const current=await tx.getCurrentActor(actor,c.stage);
   const e=await tx.getEvidenceForStage(caseId,actor.organizationId,c.stage);
   const disputed=await tx.hasUnresolvedDispute(caseId,actor.organizationId);
   const base=evaluateReadiness(current,c,e,disputed);
   if(c.stage==='CLOSED')return base;
   const policy=tx.getStagePolicy?await tx.getStagePolicy(actor.organizationId,c.stage):defaultWorkflowPolicy(c.stage);
   return applyWorkflowPolicy(base,e,policy,policy.version);
  });
 }
 async advance(actor:ReviewActor,caseId:string){
  return this.repo.transaction(async tx=>{
   const c=await this.findCase(tx,actor,caseId);
   const current=await tx.getCurrentActor(actor,c.stage);
   const evidence=await tx.getEvidenceForStage(caseId,actor.organizationId,c.stage);
   const disputed=await tx.hasUnresolvedDispute(caseId,actor.organizationId);
   const base=evaluateReadiness(current,c,evidence,disputed);
   if(c.stage==='CLOSED')throw new WorkflowFailure('CASE_NOT_OPEN','Cannot advance a closed case');
   const policy=tx.getStagePolicy?await tx.getStagePolicy(actor.organizationId,c.stage):defaultWorkflowPolicy(c.stage);
   const readiness=applyWorkflowPolicy(base,evidence,policy,policy.version);
   if(!readiness.canAdvance)throw new WorkflowFailure(readiness.blockers[0],`Cannot advance: ${readiness.blockers.join(', ')}`);
   const next=readiness.nextStage!;
   await tx.changeStage(caseId,actor.organizationId,next,next==='CLOSED'?'CLOSED':'OPEN');
   if(next==='CLOSED')await tx.completeAsset(c.assetId,actor.organizationId);
   await tx.audit(actor,'CASE_STAGE_ADVANCED',caseId,{from:c.stage,to:next,evidenceAccepted:true,workflowPolicyVersion:readiness.workflowPolicyVersion,additionalEvidenceRequired:readiness.additionalEvidenceRequired});
   return {caseId,stage:next,status:next==='CLOSED'?'CLOSED':'OPEN',notice:DISCLAIMER};
  });
 }
}
