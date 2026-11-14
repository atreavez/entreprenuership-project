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
/** Normalized CORS allowlist, shared by startup validation and the live Nest listener.
 * Never silently fall back to localhost after a rejected production setting.
 */
export function allowedWebOrigins(value:string|undefined,production:boolean):string[]{
 const origins=(value||'').split(',').map(x=>x.trim());
 if(origins.some(s=>!validOrigin(s,production))||new Set(origins).size!==origins.length)
  throw new Error('WEB_ORIGIN_INVALID');
 return origins;
}
export function apiListenPort(value:string|undefined):number{
 if(value===undefined||value==='')return 4000;
 if(!/^[1-9][0-9]{0,4}$/.test(value))throw new Error('PORT_INVALID');
 const port=Number(value);
 if(!Number.isInteger(port)||port>65535)throw new Error('PORT_INVALID');
 return port;
}
export function apiListenHost(env:RuntimeEnvironment):string{
 // All explicitly marked disposable E2E APIs must be loopback-only regardless
 // of API_BIND_HOST; this is an invariant, not merely a documentation note.
 if(env.NODE_ENV==='test')return '127.0.0.1';
 // Development, just like production, is loopback-only by default.
 // Explicit LAN exposure requires a separate affirmative startup policy check.
 return env.API_BIND_HOST||'127.0.0.1';
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
 const loginPepper=env.LOGIN_ABUSE_PEPPER||'';
 if(!hexKey(loginPepper)||weakKey(loginPepper)||new Set(loginPepper.toLowerCase()).size<10)
  problem('LOGIN_ABUSE_KEY_INVALID','Configure a unique random 32-byte LOGIN_ABUSE_PEPPER for login availability in every environment.');
 if(hexKey(loginPepper) && (loginPepper.toLowerCase()===mfa.toLowerCase() ||
   Object.values(ring||{}).some(v=>typeof v==='string'&&v.toLowerCase()===loginPepper.toLowerCase())))
  problem('LOGIN_ABUSE_KEY_REUSE','Do not reuse the login-abuse HMAC key for encryption or MFA.');
 const db=env.DATABASE_URL||'';
 try{
  const url=new URL(db);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname||url.pathname==='/')throw Error('Bad URL');
  if(production&&(url.password==='assettrust_dev_password'||url.password==='local_ci_only_password'||url.hostname==='localhost'||url.hostname==='127.0.0.1'||!url.password))problem('DATABASE_UNSAFE','Production DATABASE_URL must not use development credentials or a localhost database.');
 }catch{problem('DATABASE_URL_INVALID','DATABASE_URL must identify a PostgreSQL database.');}
 try{allowedWebOrigins(env.WEB_ORIGIN,production)}catch{problem('WEB_ORIGIN_INVALID','WEB_ORIGIN must contain distinct, explicit allowed origins; HTTPS is required in production.');}
 try{apiListenPort(env.PORT)}catch{problem('PORT_INVALID','PORT must be an integer from 1 to 65535.');}
 const bind=env.API_BIND_HOST;
 const publicBind=bind==='0.0.0.0'||bind==='::';
 if(bind!==undefined&&bind!==''&&!['127.0.0.1','localhost','::1','0.0.0.0','::'].includes(bind))
  problem('API_BIND_HOST_INVALID','API_BIND_HOST must be an explicit loopback address or a reviewed all-interface binding.');
 if(!production&&env.NODE_ENV!=='test'&&publicBind&&env.ASSETTRUST_ALLOW_LAN_DEV!=='YES')
  problem('DEV_PUBLIC_BIND','Development LAN binding requires explicit ASSETTRUST_ALLOW_LAN_DEV=YES; prefer a local reverse proxy.');
 if(production && publicBind && env.ASSETTRUST_PRIVATE_PROXY_NETWORK!=='YES')
  problem('PUBLIC_API_BIND','Do not bind the API to public interfaces unless access is restricted to an approved private proxy network.');
 if(production && env.DEBUG && env.DEBUG!=='false' && env.DEBUG!=='0')problem('DEBUG_PRODUCTION','Disable DEBUG in production.');
 if(production && env.VITE_DESIGN_PREVIEW==='true')problem('DEMO_PRODUCTION','Design preview must not be enabled in production.');
 if(production && (!env.CLAMAV_SOCKET_PATH || !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(env.CLAMAV_SOCKET_PATH) || env.CLAMAV_SOCKET_PATH.length>100 || env.CLAMAV_TCP_PORT))
  problem('DOCUMENT_SCANNER_REQUIRED','Production requires a trusted local ClamAV Unix socket; TCP and missing scanners are forbidden.');
 if(production&&env.ASSETTRUST_E2E_TARGET_ID)problem('TEST_MARKER_PRODUCTION','Never enable an E2E target marker in production.');
 const marker=env.ASSETTRUST_E2E_TARGET_ID;
 if(marker!==undefined&&marker!==''){
  if(env.NODE_ENV!=='test')problem('TEST_MARKER_OUTSIDE_TEST','Disposable API markers require NODE_ENV=test and loopback-only API binding.');
  if(!/^[A-Za-z0-9_-]{12,128}$/.test(marker))problem('TEST_MARKER_INVALID','Disposable API marker must be a safe nonempty identifier.');
  if(env.ASSETTRUST_E2E_EXPECT_TARGET&&env.ASSETTRUST_E2E_EXPECT_TARGET!==marker)
   problem('TEST_MARKER_MISMATCH','Expected E2E target marker must match the running API marker.');
 }
 if(env.ASSETTRUST_E2E_ALLOW_MUTATION==='YES'&&(env.NODE_ENV!=='test'||!marker))
  problem('TEST_MUTATION_UNSAFE','E2E mutation authorization requires test mode and an owned disposable API marker.');
 if(env.NODE_ENV==='test'&&env.API_BIND_HOST&&!['127.0.0.1','localhost'].includes(env.API_BIND_HOST))
  problem('TEST_BIND_UNSAFE','Disposable test APIs must bind to loopback only.');
 return {ok:issues.length===0,issues};
}
