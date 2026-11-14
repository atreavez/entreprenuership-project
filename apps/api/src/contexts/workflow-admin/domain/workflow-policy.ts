/** Pure DDD policy: organization-configurable stricter verification gates.
 * Required evidence, reviewer eligibility, stage order, independent review and legal disclaimers are NOT editable. */
import {STAGES,STAGE_REQUIRED_EVIDENCE, type EvidenceRecord, type Readiness} from '../../verification/domain/evidence-policy';
export const editableStages=STAGES.filter(stage=>stage!=='CLOSED');
export const eligibleAdditionalEvidence=['IDENTITY','DOCUMENT','REGISTRY_SEARCH','FIELD_REPORT','LEGAL_OPINION','DECISION'] as const;
export type AdditionalEvidence=typeof eligibleAdditionalEvidence[number]|null;
export type WorkflowStagePolicy={stage:string;targetDays:number;reminderDays:number;additionalEvidenceType:AdditionalEvidence};
export type VersionedWorkflowPolicy=WorkflowStagePolicy&{version:number};
export function assertPolicyVersion(value:unknown):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('Invalid expected version');return value;
}
export function prepareWorkflowPolicy(stage:unknown,input:unknown):WorkflowStagePolicy{
 if(typeof stage!=='string'||!editableStages.includes(stage as typeof editableStages[number]))throw Error('Unsupported workflow stage');
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid workflow policy');
 const row=input as Record<string,unknown>;
 const allowed=['targetDays','reminderDays','additionalEvidenceType'];
 if(Object.keys(row).some(k=>!allowed.includes(k))||!allowed.every(k=>Object.prototype.hasOwnProperty.call(row,k)))throw Error('Unsupported workflow policy field');
 if(!Number.isSafeInteger(row.targetDays)||typeof row.targetDays!=='number'||row.targetDays<1||row.targetDays>365)throw Error('Target days must be 1 to 365');
 if(!Number.isSafeInteger(row.reminderDays)||typeof row.reminderDays!=='number'||row.reminderDays<0||row.reminderDays>=row.targetDays)throw Error('Reminder days must be from 0 to less than the target');
 const extra=row.additionalEvidenceType;
 if(extra!==null&&(!eligibleAdditionalEvidence.includes(extra as typeof eligibleAdditionalEvidence[number])||extra===STAGE_REQUIRED_EVIDENCE[stage]))throw Error('Additional evidence must be a different recognized evidence type');
 return {stage,targetDays:row.targetDays,reminderDays:row.reminderDays,additionalEvidenceType:extra as AdditionalEvidence};
}
export function defaultWorkflowPolicy(stage:string):VersionedWorkflowPolicy{
 if(!editableStages.includes(stage as typeof editableStages[number]))throw Error('Unsupported workflow stage');
 return {stage,targetDays:14,reminderDays:3,additionalEvidenceType:null,version:0};
}
export type ExtendedReadiness=Readiness&{workflowPolicyVersion:number;targetDays:number;reminderDays:number;additionalEvidenceRequired:AdditionalEvidence};
/** Monotonic: an organization may add evidence gates but NEVER weaken mandatory gates. */
export function applyWorkflowPolicy(base:Readiness,evidence:EvidenceRecord[],policy:WorkflowStagePolicy,version:number):ExtendedReadiness{
 if(base.stage!==policy.stage)throw Error('Workflow policy stage mismatch');
 const blockers=[...base.blockers];
 if(policy.additionalEvidenceType&&!evidence.some(e=>e.stage===base.stage&&e.evidence_type===policy.additionalEvidenceType&&e.review_status==='ACCEPTED'&&!!e.reviewed_by&&e.reviewed_by!==e.recorded_by))blockers.push('ADDITIONAL_EVIDENCE_NOT_ACCEPTED');
 return {...base,blockers,canAdvance:base.canAdvance&&blockers.length===0,workflowPolicyVersion:version,targetDays:policy.targetDays,reminderDays:policy.reminderDays,additionalEvidenceRequired:policy.additionalEvidenceType};
}
