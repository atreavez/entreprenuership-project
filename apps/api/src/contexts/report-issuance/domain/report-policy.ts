/** DOMAIN: deterministic issuance constraints. Does not access HTTP, SQL, or infrastructure. */
export const REPORT_NOTICE='AssetTrust records are private verification evidence, not a government-issued title or proof of legal ownership. Verify official ownership with authorized government offices.';
export const REPORT_LEGAL_STATUS='PRIVATE_NON_OFFICIAL_EVIDENCE_REPORT' as const;
const REQUIREMENTS:ReadonlyArray<[string,string]>=[
 ['INTAKE','IDENTITY'],['DOCUMENT_REVIEW','DOCUMENT'],['REGISTRY_SEARCH','REGISTRY_SEARCH'],
 ['FIELD_INSPECTION','FIELD_REPORT'],['LEGAL_REVIEW','LEGAL_OPINION'],['FINAL_REVIEW','DECISION']
];
export type IssuableCase={id:string;organizationId:string;assetId:string;caseCode:string;assetCode:string;stage:string;status:string;organizationName:string};
export type IssuableEvidence={id:string;stage:string;evidence_type:string;review_status:string;recorded_by:string;reviewed_by?:string|null;source_name:string;reference:string;observations:string};
export type ReportCopy={text:string;revision:number;source:'APPROVED'|'DEFAULT'};
export function assertReportIssuable(c:IssuableCase,items:IssuableEvidence[],activeDisputes:number):true{
 if(!c||c.stage!=='CLOSED'||c.status!=='CLOSED')throw Error('Only completed CLOSED cases may be proposed for issuance');
 if(!Number.isSafeInteger(activeDisputes)||activeDisputes!==0)throw Error('An unresolved dispute blocks report issuance');
 if(!Array.isArray(items)||items.length>1000)throw Error('Invalid evidence set');
 if(new Set(items.map(e=>e.id)).size!==items.length)throw Error('Duplicate evidence identifiers');
 for(const [stage,type] of REQUIREMENTS){
  if(!items.some(e=>e.stage===stage&&e.evidence_type===type&&e.review_status==='ACCEPTED'&&
   typeof e.reviewed_by==='string'&&e.reviewed_by.length>0&&e.reviewed_by!==e.recorded_by)){
   throw Error(`Independently accepted ${type} evidence is missing from ${stage}`);
  }
 }
 return true;
}
/** Approved wording remains context, never a government finding or certification. */
export function assertSafeReportWording(value:unknown):string{
 if(typeof value!=='string'||value.trim().length<8||value.length>1200||/[<>\x00-\x1f\x7f]/.test(value))throw Error('Invalid report summary');
 if(/\b(?:official\s+(?:government\s+)?(?:land\s+)?(?:title|certificate|certification)|government[ -](?:certified|approved)|guaranteed\s+ownership)\b/i.test(value))throw Error('Cannot issue an official-ownership claim');
 return value.trim();
}
export function prepareSnapshot(c:IssuableCase,items:IssuableEvidence[],activeDisputes:number,copy:ReportCopy){
 assertReportIssuable(c,items,activeDisputes);
 if(!copy||(copy.source!=='APPROVED'&&copy.source!=='DEFAULT')||!Number.isSafeInteger(copy.revision)||copy.revision<0)throw Error('Invalid published template revision');
 const summary=assertSafeReportWording(copy.text);
 const evidence=items.filter(e=>e.review_status==='ACCEPTED').map(e=>({
  id:e.id,stage:e.stage,type:e.evidence_type,sourceName:e.source_name,reference:e.reference,
  observations:e.observations,recordedBy:e.recorded_by,reviewedBy:e.reviewed_by
 })).sort((a,b)=>REQUIREMENTS.findIndex(x=>x[0]===a.stage)-REQUIREMENTS.findIndex(x=>x[0]===b.stage)||a.id.localeCompare(b.id));
 return {reportType:'ASSETTRUST_EVIDENCE_ISSUANCE_V1',legalStatus:REPORT_LEGAL_STATUS,
  legalNotice:REPORT_NOTICE,caseId:c.id,caseCode:c.caseCode,organizationId:c.organizationId,
  organizationName:c.organizationName,assetId:c.assetId,assetCode:c.assetCode,
  summary,templateRevision:copy.revision,templateSource:copy.source,
  evidence,assurance:'PRIVATE_INDEPENDENT_EVIDENCE_REVIEW_NO_GOVERNMENT_ATTESTATION'};
}
/** Stable canonical JSON. Do not include mutable or wall-clock fields in the snapshot. */
export function canonicalSnapshot(value:unknown):string{
 const visit=(v:any):any=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return v.map(visit);
  if(typeof v==='object'&&(Object.getPrototypeOf(v)===null||Object.getPrototypeOf(v)?.constructor?.name==='Object')){
   const out:Record<string,any>={};for(const k of Object.keys(v).sort()){
    if(k==='__proto__'||k==='constructor'||k==='prototype')throw Error('Unsafe snapshot key');
    out[k]=visit(v[k]);
   }return out;
  }
  throw Error('Only finite, canonical JSON values may be included in issued snapshots');
 };
 return JSON.stringify(visit(value));
}
/** Withdrawal is a separate, audited decision; never erase issued evidence. */
export function assertWithdrawalReason(value:unknown):string{
 if(typeof value!=='string'||value.trim().length<20||value.length>1000||/[<>\x00-\x1f\x7f]/.test(value))throw Error('Withdrawal reason must be 20–1000 characters of plain text');
 return value.trim();
}
export function assertVerificationToken(value:unknown):string{
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error('Invalid public report reference');
 return value;
}
/** PUBLIC: Never expose cases, organizations, evidence, names, or access tokens. */
export function publicVerification(row:{id:string;snapshot_sha256?:string;issued_at?:string;superseded?:boolean;under_review?:boolean;withdrawn?:boolean;withdrawal_pending?:boolean},integrityOk:boolean){
 if(!integrityOk)return {status:'INTEGRITY_CHECK_FAILED',legalStatus:'NON_OFFICIAL_PRIVATE_EVIDENCE',notice:REPORT_NOTICE};
 return {status:row.withdrawn?'WITHDRAWN':row.superseded?'SUPERSEDED':(row.under_review||row.withdrawal_pending)?'UNDER_REVIEW':'ISSUED',legalStatus:'NON_OFFICIAL_PRIVATE_EVIDENCE',
  reportId:row.id,issuedAt:row.issued_at,sha256:row.snapshot_sha256,notice:REPORT_NOTICE,
  meaning:row.withdrawn?'This record was withdrawn by its issuing organization. Do not rely on it.': 'This verifies a record within AssetTrust only. It does not verify ownership or government approval.'};
}
