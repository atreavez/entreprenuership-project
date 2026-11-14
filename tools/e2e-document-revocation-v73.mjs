/**
 * AssetTrust v0.73: live, write-enabled local-only document revocation acceptance.
 * Creates synthetic principals in a disposable database, checks encrypted
 * download and denies reads after a grant is revoked. Never runs on production.
 */
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {enrollSyntheticAdminMfa} from './e2e-mfa-onboarding-v82.mjs';
import {mkdirSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {authorize as authorizeV69,inspectOwnedApi} from './e2e-authenticated-control-v69.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const MAX_RESPONSE=6*1024*1024;
function authorized(env){
 if(env.ASSETTRUST_V73_DOCUMENT_CONFIRM!=='YES')throw Error('DOCUMENT_REVOCATION_CONFIRMATION_REQUIRED');
 return authorizeV69(env);
}
function pdfBytes(){
 // Synthetic, no actual customer records. Build valid PDF xref byte offsets.
 const stream='BT /F1 11 Tf 20 150 Td (TEST ONLY) Tj ET';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
 ];
 let file='%PDF-1.4\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){
  offsets.push(Buffer.byteLength(file));
  file+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;
 }
 const start=Buffer.byteLength(file);
 file+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))file+=`${String(offset).padStart(10,'0')} 00000 n \n`;
 file+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
 return Buffer.from(file);
}
async function request(fetcher,origin,endpoint,{method='GET',body,token,allowed=[200],binary=false}={}){
 if(!/^\/[a-zA-Z0-9/?=&._-]+$/.test(endpoint)||endpoint.startsWith('//'))throw Error('UNSAFE_TEST_ENDPOINT');
 const headers={Accept:binary?'application/pdf':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined&&!(body instanceof FormData))headers['Content-Type']='application/json';
 let response;
 try{
  response=await fetcher(origin+'/api/v1'+endpoint,{method,headers,
   body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 }catch{throw Error('DOCUMENT_TEST_HTTP_TRANSPORT_FAILED');}
 if(!allowed.includes(response.status))throw Error('DOCUMENT_TEST_STATUS_MISMATCH');
 const size=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(size)&&size>MAX_RESPONSE)throw Error('DOCUMENT_TEST_RESPONSE_TOO_LARGE');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>MAX_RESPONSE)throw Error('DOCUMENT_TEST_RESPONSE_TOO_LARGE');
 if(binary)return {status:response.status,bytes};
 try{return bytes.length?JSON.parse(bytes.toString('utf8')):{};}
 catch{throw Error('DOCUMENT_TEST_JSON_INVALID');}
}
export function plan(){return {schema:'ASSETTRUST_V73_DOCUMENT_READ_PLAN',productionApproved:false,liveTested:false,
  prerequisites:['Owned local HTTP API with verified RLS policies','Disposable PostgreSQL and distinct restricted runtime role','Live ClamAV and encrypted blob store','Explicit ASSETTRUST_V69_AUTH_CONFIRM and ASSETTRUST_V73_DOCUMENT_CONFIRM'],
  steps:['Register two synthetic organizations','Invite an in-organization reviewer','Upload malware-screened encrypted PDF','Verify authorized download bytes','Prove cross-tenant download denial','Grant asset READ to reviewer','Verify authorized reviewer download','Revoke exact resource grant','Prove subsequent download and list denial'],
  effect:'Creates synthetic records in a disposable DB. Does not modify or approve production.'};}
export async function acceptance(env=process.env,fetcher=globalThis.fetch,{random=()=>randomBytes(12).toString('hex')}={}){
 const result={schema:'ASSETTRUST_V73_DOCUMENT_REVOCATION',status:'BLOCKED',productionApproved:false,liveDocumentRevocationPassed:false,checks:[],issues:[],syntheticDataCreated:false};
 const checked=label=>result.checks.push(label);
 try{
  const target=authorized(env);
  await inspectOwnedApi(env,fetcher);checked('owned-api-and-live-rls-readiness');
  result.status='FAILED';
  const nonce=random();if(!/^[a-f0-9]{24}$/.test(nonce))throw Error('UNSAFE_DOCUMENT_TEST_NONCE');
  const credential='TestOnly!'+randomBytes(24).toString('base64url')+'a7';
  const account=(name)=>`${name}-${nonce}@test.invalid`;
  const post=(url,options)=>request(fetcher,target.origin,url,options);
  const a=await post('/auth/register',{method:'POST',allowed:[201],body:{fullName:'Synthetic V73 Owner',organization:'Synthetic V73 Documents A '+nonce,email:account('owner-a'),password:credential}});
  result.syntheticDataCreated=true;
  const b=await post('/auth/register',{method:'POST',allowed:[201],body:{fullName:'Synthetic V73 Other',organization:'Synthetic V73 Documents B '+nonce,email:account('owner-b'),password:credential}});
  if(typeof a.accessToken!=='string'||typeof b.accessToken!=='string')throw Error('DOCUMENT_TEST_MISSING_TOKENS');
  // Real synthetic founders must complete MFA before protected document operations.
  const sendMfa=(route,token,body)=>post(route,{method:'POST',allowed:[201],token,body});
  await enrollSyntheticAdminMfa({token:a.accessToken,password:credential,send:sendMfa});
  await enrollSyntheticAdminMfa({token:b.accessToken,password:credential,send:sendMfa});
  checked('two-organization-registration');
  const asset=await post('/assets',{method:'POST',allowed:[201],token:a.accessToken,body:{assetType:'LAND',district:'Wakiso',declaredOwner:'Synthetic, not a legal title',parcelReference:'V73-'+nonce,description:'Test only'}});
  if(typeof asset.id!=='string'||asset.id.length<20)throw Error('DOCUMENT_TEST_ASSET_NOT_CREATED');
  checked('own-asset-created');
  const invitation=await post('/team/invitations',{method:'POST',allowed:[201],token:a.accessToken,body:{email:account('reviewer'),role:'REVIEWER'}});
  if(typeof invitation.inviteToken!=='string')throw Error('DOCUMENT_TEST_INVITE_MISSING');
  await post('/team/accept',{method:'POST',allowed:[201],body:{token:invitation.inviteToken,fullName:'Synthetic V73 Reviewer',password:credential}});
  const login=await post('/auth/login',{method:'POST',allowed:[201],body:{email:account('reviewer'),password:credential}});
  if(typeof login.accessToken!=='string')throw Error('DOCUMENT_TEST_REVIEWER_LOGIN_FAILED');
  const me=await post('/auth/me',{token:login.accessToken});
  if(typeof me.id!=='string'||me.id.length<20)throw Error('DOCUMENT_TEST_REVIEWER_NOT_FOUND');
  checked('invited-reviewer-authenticated');
  const original=pdfBytes();const multipart=new FormData();
  multipart.append('assetId',asset.id);
  multipart.append('file',new Blob([original],{type:'application/pdf'}),'synthetic-proof.pdf');
  const document=await post('/documents/upload',{method:'POST',token:a.accessToken,allowed:[201],body:multipart});
  if(typeof document.id!=='string'||document.storageFormat!=='AES_256_GCM_V1')throw Error('DOCUMENT_TEST_ENCRYPTION_NOT_VERIFIED');
  checked('document-screened-and-encrypted');
  const download=endpoint=>post(endpoint,{token:a.accessToken,allowed:[200],binary:true});
  const url='/documents/'+document.id+'/file';
  const owner=await download(url);
  if(createHash('sha256').update(owner.bytes).digest('hex')!==createHash('sha256').update(original).digest('hex'))throw Error('DOCUMENT_TEST_CONTENT_MISMATCH');
  checked('owner-exact-encrypted-download');
  await post(url,{token:b.accessToken,allowed:[403,404]});
  checked('cross-organization-download-rejected');
  await post(url,{token:login.accessToken,allowed:[403,404]});
  checked('ungranted-reviewer-download-rejected');
  await post('/access/assets/'+asset.id+'/grants',{method:'POST',token:a.accessToken,allowed:[201],body:{granteeId:me.id,permission:'READ',expiresAt:new Date(Date.now()+60*60000).toISOString()}});
  const grantList=await post('/access/assets/'+asset.id+'/grants',{token:a.accessToken});
  if(!Array.isArray(grantList))throw Error('DOCUMENT_TEST_GRANT_LIST_INVALID');
  const matches=grantList.filter(x=>x.permission==='READ'&&x.email===account('reviewer'));
  if(matches.length!==1||typeof matches[0].id!=='string')throw Error('DOCUMENT_TEST_EXACT_GRANT_NOT_FOUND');
  checked('review-grant-created-and-visible');
  const reviewerBytes=await post(url,{token:login.accessToken,allowed:[200],binary:true});
  if(!reviewerBytes.bytes.equals(original))throw Error('DOCUMENT_TEST_GRANTED_BYTES_MISMATCH');
  checked('granted-reviewer-exact-download');
  await post('/access/grants/'+matches[0].id,{method:'DELETE',token:a.accessToken,allowed:[200]});
  await post(url,{token:login.accessToken,allowed:[403,404]});
  const visible=await post('/documents',{token:login.accessToken});
  if(!Array.isArray(visible)||visible.some(x=>x.id===document.id))throw Error('DOCUMENT_TEST_REVOKED_LIST_LEAK');
  checked('grant-revoked-and-both-read-paths-deny');
  result.status='DOCUMENT_REVOCATION_ACCEPTANCE_PASSED_RELEASE_BLOCKED';result.liveDocumentRevocationPassed=true;
 }catch(error){
  const code=String(error?.message||'UNKNOWN_DOCUMENT_TEST_FAILURE');
  result.issues.push(/^[A-Z0-9_]+$/.test(code)?code:'DOCUMENT_ACCEPTANCE_ASSERTION_FAILED');
  if(result.status!=='BLOCKED')result.status='FAILED';
 }
 return result;
}
export function saveReport(report,root=ROOT,random=()=>randomUUID()){
 const dir=join(root,'test-evidence','v73');mkdirSync(dir,{recursive:true});
 const stat=lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('UNSAFE_EVIDENCE_DIRECTORY');
 const file=join(dir,'document-revocation-'+random()+'.json');
 const fd=openSync(file,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 return file;
}
export async function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--plan','--run'].includes(args[0])){console.error('Usage: --plan | --run');process.exitCode=1;return;}
 if(args[0]==='--plan'){console.log(JSON.stringify(plan(),null,2));return;}
 try{authorized(process.env);}catch{console.error('BLOCKED: DOCUMENT_REVOCATION_CONFIRMATION_REQUIRED');process.exitCode=1;return;}
 const result=await acceptance();
 try{saveReport(result);}catch{console.error('BLOCKED: PRIVATE_EVIDENCE_WRITE_FAILED');process.exitCode=1;return;}
 console.log(JSON.stringify(result,null,2));if(!result.liveDocumentRevocationPassed)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
