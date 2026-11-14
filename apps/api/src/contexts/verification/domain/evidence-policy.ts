/** DOMAIN: framework-free, deterministic rules. No network, SQL, HTTP, or clock dependencies. */
export const STAGES = ['INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW','CLOSED'] as const;
export type CaseStage = typeof STAGES[number];
export type ReviewDecision = 'ACCEPTED'|'REJECTED';
export type Role = 'ORG_ADMIN'|'CLIENT'|'REVIEWER'|'SURVEYOR'|'LEGAL_REVIEWER';
export type ReviewActor = {id:string;organizationId:string;role:Role;professionalApproved:boolean};
export type EvidenceRecord = {
 id?:string;stage:string;evidence_type:string;recorded_by:string;
 review_status:string;reviewed_by?:string|null;
};
export type CaseRecord = {
 id:string;organizationId:string;assetId:string;stage:string;status:string;
 assignedTo:string|null;createdBy:string;
};
export type Readiness = {
 stage:string;requiredEvidence:string|null;nextStage:string|null;
 canAdvance:boolean;blockers:string[];
 evidenceSummary:{submitted:number;accepted:number;rejected:number};
 notice:string;
};
export const STAGE_REQUIRED_EVIDENCE:Readonly<Record<string,string>>=Object.freeze({
 INTAKE:'IDENTITY',DOCUMENT_REVIEW:'DOCUMENT',REGISTRY_SEARCH:'REGISTRY_SEARCH',
 FIELD_INSPECTION:'FIELD_REPORT',LEGAL_REVIEW:'LEGAL_OPINION',FINAL_REVIEW:'DECISION'
});
export const DISCLAIMER='Internal evidence workflow only. Neither approval nor an integrity hash is proof of legal title, official registry status, or government endorsement.';
export function isStageReviewer(actor:ReviewActor,stage:string):boolean{
 if(stage==='FIELD_INSPECTION')return actor.professionalApproved && actor.role==='SURVEYOR';
 if(stage==='LEGAL_REVIEW')return actor.professionalApproved && actor.role==='LEGAL_REVIEWER';
 // The final decision is authored by an administrator and independently
 // accepted by a DIFFERENT current organization administrator. Legal review
 // already required an accredited LEGAL_REVIEWER at the preceding stage.
 if(stage==='FINAL_REVIEW')return actor.role==='ORG_ADMIN';
 return actor.role==='ORG_ADMIN'||actor.role==='REVIEWER';
}
export function mayReviewEvidence(actor:ReviewActor,evidence:EvidenceRecord,currentStage:string):boolean{
 return evidence.stage===currentStage && evidence.recorded_by!==actor.id &&
  evidence.review_status==='SUBMITTED' && isStageReviewer(actor,currentStage);
}
export function hasIndependentAcceptedEvidence(stage:string,items:EvidenceRecord[]):boolean{
 const required=STAGE_REQUIRED_EVIDENCE[stage];
 return !!required && items.some(item=>item.stage===stage && item.evidence_type===required &&
  item.review_status==='ACCEPTED' && !!item.reviewed_by && item.reviewed_by!==item.recorded_by);
}
export function mayAdvanceStage(actor:ReviewActor,caseRecord:CaseRecord):boolean{
 if(actor.role!=='ORG_ADMIN' && caseRecord.assignedTo!==actor.id)return false;
 if(caseRecord.stage==='FIELD_INSPECTION')return actor.professionalApproved && actor.role==='SURVEYOR';
 if(caseRecord.stage==='LEGAL_REVIEW')return actor.professionalApproved && actor.role==='LEGAL_REVIEWER';
 // Administrators intentionally do not carry professional accreditation;
 // requiring professionalApproved here made successful closure impossible.
 if(caseRecord.stage==='FINAL_REVIEW')return actor.role==='ORG_ADMIN';
 return actor.role==='ORG_ADMIN'||actor.role==='REVIEWER';
}
/** Stage-specific assignee eligibility is a pure domain rule. Assignment alone
 * does not confer accreditation, which the infrastructure checks separately. */
export function canAssignCaseStage(stage:string,role:string):boolean{
 if(stage==='FIELD_INSPECTION')return role==='SURVEYOR';
 if(stage==='LEGAL_REVIEW')return role==='LEGAL_REVIEWER';
 if(stage==='FINAL_REVIEW')return role==='ORG_ADMIN';
 if(stage==='CLOSED')return false;
 return role==='ORG_ADMIN'||role==='REVIEWER';
}
export function nextStage(stage:string):string|null{
 const i=STAGES.findIndex(s=>s===stage);
 return i<0||i===STAGES.length-1?null:STAGES[i+1];
}
export function evaluateReadiness(actor:ReviewActor,c:CaseRecord,items:EvidenceRecord[],hasDispute:boolean):Readiness{
 const blockers:string[]=[];const next=nextStage(c.stage);
 if(c.status!=='OPEN'||!next)blockers.push('CASE_NOT_OPEN');
 if(hasDispute)blockers.push('DISPUTE_OPEN');
 if(!mayAdvanceStage(actor,c))blockers.push('STAGE_PERMISSION_DENIED');
 if(next && !hasIndependentAcceptedEvidence(c.stage,items))blockers.push('EVIDENCE_NOT_ACCEPTED');
 return {stage:c.stage,requiredEvidence:STAGE_REQUIRED_EVIDENCE[c.stage]||null,nextStage:next,
  canAdvance:blockers.length===0,blockers,evidenceSummary:{
   submitted:items.filter(e=>e.review_status==='SUBMITTED').length,
   accepted:items.filter(e=>e.review_status==='ACCEPTED').length,
   rejected:items.filter(e=>e.review_status==='REJECTED').length
  },notice:DISCLAIMER};
}
