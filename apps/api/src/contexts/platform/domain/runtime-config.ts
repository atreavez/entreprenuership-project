/** Framework-independent deployment configuration policy.
 * Never include secret values in returned errors or operational logs.
 */
export type RuntimeEnvironment=Record<string,string|undefined>;
export type RuntimeIssue={code:string;message:string};
export type RuntimeAssessment={ok:boolean;issues:RuntimeIssue[]};
const PLACEHOLDER=/replace|change[_-]?me|your[_-]?secret|placeholder|example[_-]?secret|test[_-]?only/i;
function hexKey(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)}
function weakKey(value:string):boolean{return /^(.)\1{63}$/i.test(value)||/^(..)\1{31}$/i.test(value)||/^(.{4})\1{15}$/i.test(value)}
function validOrigin(s:string,production:boolean):boolean{
 try{
  const url=new URL(s);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.origin==='null')return false;
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&!production))return false;
  if(production&&['localhost','127.0.0.1','::1'].includes(url.hostname))return false;
  return true;
 }catch{return false}
}
export function validateRuntimeConfig(env:RuntimeEnvironment):RuntimeAssessment{
 const issues:RuntimeIssue[]=[];
 const problem=(code:string,message:string)=>issues.push({code,message});
 const production=env.NODE_ENV==='production';
 if(env.NODE_ENV&&!['development','test','production'].includes(env.NODE_ENV))problem('NODE_ENV_INVALID','NODE_ENV must be development, test, or production.');
 const jwt=env.JWT_SECRET||'';
 if(jwt.length<32||PLACEHOLDER.test(jwt)||new Set(jwt).size<10)problem('JWT_WEAK','Configure a unique, random JWT_SECRET with at least 32 characters.');
 const mfa=env.MFA_ENCRYPTION_KEY||'';
 if(!hexKey(mfa)||weakKey(mfa))problem('MFA_KEY_INVALID','Configure MFA_ENCRYPTION_KEY using 32 random bytes encoded as 64 hex characters.');
 let ring:Record<string,unknown>|null=null;
 try{
  const parsed:unknown=JSON.parse(env.DOCUMENT_ENCRYPTION_KEYS||'');
  if(parsed && typeof parsed==='object' && !Array.isArray(parsed))ring=parsed as Record<string,unknown>;
 }catch{/* privacy-safe error below */}
 if(!ring)problem('DOCUMENT_KEYRING_INVALID','DOCUMENT_ENCRYPTION_KEYS must be a JSON object of key ID to 64-character hex key.');
 const active=env.DOCUMENT_ACTIVE_KEY_ID||'';
 if(!active||!ring||!Object.prototype.hasOwnProperty.call(ring,active))problem('DOCUMENT_KEY_MISSING','DOCUMENT_ACTIVE_KEY_ID must identify a configured encryption key.');
 if(ring){
  for(const value of Object.values(ring)){
   if(!hexKey(value)||weakKey(value)){problem('DOCUMENT_KEY_WEAK','Each document encryption key must be 32 random bytes encoded as 64 hex characters.');break}
  }
  if(hexKey(mfa)&&Object.values(ring).some(v=>typeof v==='string'&&v.toLowerCase()===mfa.toLowerCase()))problem('SECRET_REUSE','Use separate keys for MFA and document encryption.');
  if(jwt.toLowerCase()===mfa.toLowerCase()||Object.values(ring).some(v=>typeof v==='string'&&v.toLowerCase()===jwt.toLowerCase()))problem('SECRET_REUSE','JWT, MFA and document keys must remain separate.');
  if(new Set(Object.values(ring).map(v=>typeof v==='string'?v.toLowerCase():v)).size<Object.values(ring).length)problem('DOCUMENT_KEY_REUSE','Each document encryption key ID must refer to a distinct key.');
 }
 const db=env.DATABASE_URL||'';
 try{
  const url=new URL(db);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname||url.pathname==='/')throw Error('Bad URL');
  if(production&&(url.password==='assettrust_dev_password'||url.password==='local_ci_only_password'||url.hostname==='localhost'||url.hostname==='127.0.0.1'||!url.password))problem('DATABASE_UNSAFE','Production DATABASE_URL must not use development credentials or a localhost database.');
 }catch{problem('DATABASE_URL_INVALID','DATABASE_URL must identify a PostgreSQL database.');}
 const origins=(env.WEB_ORIGIN||'').split(',').map(x=>x.trim());
 if(!origins.length||origins.some(s=>!validOrigin(s,production))||new Set(origins).size!==origins.length)problem('WEB_ORIGIN_INVALID','WEB_ORIGIN must contain distinct, explicit allowed origins; HTTPS is required in production.');
 if(production&&env.ASSETTRUST_E2E_TARGET_ID)problem('TEST_MARKER_PRODUCTION','Never enable an E2E target marker in production.');
 return {ok:issues.length===0,issues};
}
