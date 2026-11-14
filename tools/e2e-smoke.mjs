/**
 * Destructive-on-purpose LOCAL development smoke test: creates disposable records.
 * Run only against your own fresh development API, never production.
 * Requires API + PostgreSQL running and migrations 001-003 applied.
 */
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import assert from 'node:assert/strict';
import {assertSafeE2eTarget} from './e2e-safety.mjs';
import {enrollSyntheticAdminMfa} from './e2e-mfa-onboarding-v82.mjs';
const base=await assertSafeE2eTarget(process.env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000');
const key=randomBytes(7).toString('hex');const password='LocalOnly!'+randomBytes(18).toString('base64url');
async function request(path,method='GET',body,token,expected=200){const opts={method,headers:{}};if(token)opts.headers.Authorization='Bearer '+token;if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
 const response=await fetch(base+path,opts);let data;try{data=await response.json()}catch{data={}};assert.equal(response.status,expected,`${method} ${path} expected ${expected} got ${response.status}: ${JSON.stringify(data)}`);return data;}
let passes=0;function log(x){console.log('✓ '+x);passes++}
const a=await request('/auth/register','POST',{fullName:'E2E Admin A',organization:'E2E-A-'+key,email:'admin-a-'+key+'@test.invalid',password},undefined,201);log('Registered tenant A');
const b=await request('/auth/register','POST',{fullName:'E2E Admin B',organization:'E2E-B-'+key,email:'admin-b-'+key+'@test.invalid',password},undefined,201);log('Registered tenant B');
await enrollSyntheticAdminMfa({token:a.accessToken,password,send:(route,token,body)=>request(route,'POST',body,token,201)});
await enrollSyntheticAdminMfa({token:b.accessToken,password,send:(route,token,body)=>request(route,'POST',body,token,201)});
const asset=await request('/assets','POST',{assetType:'LAND',district:'Wakiso',declaredOwner:'Simulated owner - NOT VERIFIED',parcelReference:'TEST-'+key,description:'Disposable integration test, not a land registry record'},a.accessToken,201);log('Tenant A created asset');
await request('/assets/'+asset.id,'GET',undefined,b.accessToken,404);log('Tenant B cannot read tenant A asset');
const c=await request('/cases','POST',{assetId:asset.id,notes:'E2E fictional case'},a.accessToken,201);log('Created case');
await request('/cases/'+c.id+'/advance','POST',{},a.accessToken,409);log('Cannot advance without independently accepted evidence');
const before=await request('/cases/'+c.id+'/readiness','GET',undefined,a.accessToken);assert.equal(before.canAdvance,false);assert.ok(before.blockers.includes('EVIDENCE_NOT_ACCEPTED'));log('Readiness identifies missing accepted evidence');
const e=await request('/cases/'+c.id+'/evidence','POST',{stage:'INTAKE',evidenceType:'IDENTITY',sourceName:'Fictional declaration',reference:'E2E-'+key,observations:'Simulated identity submission. Not authenticated.'},a.accessToken,201);log('Evidence recorded as submitted');
await request('/cases/'+c.id+'/evidence/'+e.id+'/review','POST',{decision:'ACCEPTED',reviewNotes:'I reviewed these fictional test details.'},a.accessToken,403);log('Cannot review own evidence');
await request('/cases/'+c.id+'/advance','POST',{},a.accessToken,409);log('Case still blocked until reviewed');
const inv=await request('/team/invitations','POST',{email:'reviewer-'+key+'@test.invalid',role:'REVIEWER'},a.accessToken,201);
await request('/team/accept','POST',{token:inv.inviteToken,fullName:'E2E Reviewer',password},undefined,201);
const other=await request('/auth/login','POST',{email:'reviewer-'+key+'@test.invalid',password},undefined,201);log('Team invitation accepted');
await request('/cases/'+c.id,'GET',undefined,other.accessToken,403);log('Unassigned organization member cannot read confidential case');
const invisible=await request('/cases','GET',undefined,other.accessToken);assert.equal(invisible.some(x=>x.id===c.id),false);log('Unassigned member cannot discover case in listing');
const beforeDashboard=await request('/dashboard','GET',undefined,other.accessToken);assert.equal(beforeDashboard.recentCases.some(x=>x.id===c.id),false);log('Unassigned member cannot discover case via dashboard');
await request('/cases/'+c.id+'/assign','POST',{assigneeId:other.user.id},a.accessToken,201);log('Reviewer assigned');
const decision=await request('/cases/'+c.id+'/evidence/'+e.id+'/review','POST',{decision:'ACCEPTED',reviewNotes:'Simulated review: checked formatting only; no official title search.'},other.accessToken,201);assert.equal(decision.decision,'ACCEPTED');log('Second account accepts evidence');
const ready=await request('/cases/'+c.id+'/readiness','GET',undefined,a.accessToken);assert.equal(ready.canAdvance,true);log('Readiness becomes true after independent acceptance');
const after=await request('/cases/'+c.id+'/advance','POST',{},a.accessToken,201);assert.equal(after.stage,'DOCUMENT_REVIEW');log('Case can advance only after acceptance');
const rows=await request('/cases/'+c.id+'/evidence','GET',undefined,a.accessToken);assert.equal(rows[0].review_status,'ACCEPTED');log('Evidence review persists');
// Upload and byte integrity exercise (synthetic PDF; not a legitimate document).
const blob=Buffer.from('%PDF-1.4\n% AssetTrust E2E placeholder - not a real property document\n%%EOF\n');const form=new FormData();form.set('assetId',asset.id);form.set('file',new Blob([blob],{type:'application/pdf'}),'synthetic-test.pdf');
const up=await fetch(base+'/documents/upload',{method:'POST',headers:{Authorization:'Bearer '+a.accessToken},body:form});if(up.status!==201)throw new Error('Upload failed ('+up.status+'): '+await up.text());const file=await up.json();assert.equal(file.storageFormat,'AES_256_GCM_V1');assert.equal(file.sha256,createHash('sha256').update(blob).digest('hex'));const down=await fetch(base+'/documents/'+file.id+'/file',{headers:{Authorization:'Bearer '+a.accessToken}});assert.equal(down.status,200);assert.deepEqual(Buffer.from(await down.arrayBuffer()),blob);
// A local development-only assertion that the persisted payload contains ciphertext, not the uploaded PDF.
const uploadDir=process.env.UPLOAD_DIR||'./private-uploads';
const onDisk=await readFile(resolve(isAbsolute(uploadDir)?uploadDir:resolve(process.cwd(),'apps/api',uploadDir),`${file.id}.blob`));
assert.equal(onDisk.subarray(0,6).toString('ascii'),'ATDOC1');
assert.equal(onDisk.includes(blob),false);
const crossTenant=await fetch(base+'/documents/'+file.id+'/file',{headers:{Authorization:'Bearer '+b.accessToken}});
assert.equal(crossTenant.status,404);
log('Encrypted document persisted as ciphertext, safely decrypted on download, and denied across tenants');
console.log(`PASS: ${passes} LOCAL API/PostgreSQL integration checks. Disposable test records were created under ${key}.`)
