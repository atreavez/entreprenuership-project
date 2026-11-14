export const DEMO = import.meta.env.VITE_DESIGN_PREVIEW === 'true';
export type Principal={id:string;organizationId:string;email:string;fullName:string;role:string;professionalApproved:boolean;adminMfaRequired?:boolean;adminMfaEnrolled?:boolean};
export type Asset={id:string;asset_code:string;asset_type:string;district:string;description:string;declared_owner:string;tenure?:string;parcel_reference?:string;area_acres?:number|string;status:string;created_at:string};
export type Case={id:string;case_code:string;asset_id:string;asset_code:string;district:string;declared_owner:string;asset_type:string;stage:string;status:string;created_at:string};
export type Readiness={stage:string;requiredEvidence:string|null;nextStage:string|null;canAdvance:boolean;blockers:string[];evidenceSummary:{submitted:number;accepted:number;rejected:number};notice:string};
export type Evidence={id:string;stage:string;evidence_type:string;source_name:string;reference?:string;observations:string;created_at:string;recorded_by?:string;review_status?:string;reviewed_by?:string|null;review_notes?:string;reviewed_at?:string|null};
export type DocumentItem={id:string;asset_id?:string;case_id?:string;display_name:string;file_size:number;sha256:string;review_status:string;storage_format?:string;encryption_key_id?:string;created_at:string};
export const stages=['INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW','CLOSED'];
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
// Access token lives in JavaScript memory only. The rotating refresh credential is HttpOnly / SameSite=Strict.
let liveAccessToken='';
let refreshInFlight:Promise<{accessToken:string;user:Principal}>|null=null;
export function setAccessToken(value:string){liveAccessToken=value;}
async function responseOrError<T>(res:Response):Promise<T>{if(!res.ok){let detail:any={};try{detail=await res.json()}catch{}throw new ApiError(res.status,Array.isArray(detail.message)?detail.message.join(', '):detail.message||`Request failed (${res.status})`);}return res.json() as Promise<T>}
export async function refreshSession(){
 if(!refreshInFlight)refreshInFlight=fetch('/api/v1/auth/refresh',{method:'POST',credentials:'same-origin'}).then(responseOrError<{accessToken:string;user:Principal}>).then(x=>{setAccessToken(x.accessToken);return x}).finally(()=>refreshInFlight=null);
 return refreshInFlight;
}
export async function api<T>(path:string,token:string,options:RequestInit={}):Promise<T>{
 const publicAuth=/^\/auth\/(register|login|mfa\/complete|refresh|password\/reset\/request|password\/reset\/confirm)$/.test(path);
 const make=async(auth:string)=>{const headers=new Headers(options.headers);if(auth)headers.set('Authorization',`Bearer ${auth}`);if(options.body && !(options.body instanceof FormData))headers.set('Content-Type','application/json');try{return await fetch(`/api/v1${path}`,{...options,credentials:'same-origin',headers})}catch{throw new ApiError(0,'Cannot connect to AssetTrust API. Check backend and network.')}};
 let res=await make(publicAuth?'':liveAccessToken||token);
 if(res.status===401&&!publicAuth&&!DEMO){try{const renewed=await refreshSession();res=await make(renewed.accessToken)}catch{setAccessToken('');window.dispatchEvent(new Event('assettrust:session-expired'));throw new ApiError(401,'Session expired or revoked. Sign in again.')}}
 return responseOrError<T>(res);
}
export const post=<T=any>(path:string,token:string,data?:any):Promise<T>=>api<T>(path,token,{method:'POST',body:JSON.stringify(data||{})});
export const fmt=(v:number|undefined|null)=>new Intl.NumberFormat('en-UG').format(v||0);
export const date=(iso:string)=>new Date(iso).toLocaleDateString('en-UG',{month:'short',day:'numeric',year:'numeric'});
export const statusTone=(s:string)=> s==='ENCRYPTED'||s==='CLOSED'||s==='REVIEW_COMPLETED'||s==='ACCEPTED'?'success':s==='FLAGGED'||s==='BLOCKED'||s==='REJECTED'?'danger':s==='MIGRATION_REQUIRED'||s==='SUBMITTED'||s==='OPEN'||s==='IN_REVIEW'||s==='REGISTRY_SEARCH'||s==='DOCUMENT_REVIEW'?'warning':'neutral';
export const readable=(s:string)=>s.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

/** Authenticated downloads share the same refresh-and-retry security path as JSON calls. */
export async function secureDocumentDownload(id:string,token:string):Promise<Blob>{
 const make=(auth:string)=>fetch(`/api/v1/documents/${encodeURIComponent(id)}/file`,{credentials:'same-origin',headers:{Authorization:`Bearer ${auth}`}});
 let response=await make(liveAccessToken||token);
 if(response.status===401&&!DEMO){
  try{const refreshed=await refreshSession();response=await make(refreshed.accessToken)}catch{setAccessToken('');window.dispatchEvent(new Event('assettrust:session-expired'));throw new ApiError(401,'Session expired or revoked. Sign in again.')}
 }
 if(!response.ok)throw new ApiError(response.status,'Document unavailable or access denied');
 return response.blob();
}
