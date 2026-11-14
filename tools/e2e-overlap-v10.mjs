/** Live integration safety smoke. Localhost only, creates fictional data in dev database.
 * Requires working NestJS/PostGIS. Does NOT bypass professional review to fake an approval. */
import assert from 'node:assert/strict';
import {assertSafeE2eTarget} from './e2e-safety.mjs';
import {enrollSyntheticAdminMfa} from './e2e-mfa-onboarding-v82.mjs';
import {randomBytes} from 'node:crypto';
const base=await assertSafeE2eTarget(process.env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000');let checks=0;
async function request(route,method='GET',payload,token,expected=200){const resp=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined});const text=await resp.text();let json={};try{json=JSON.parse(text||'{}')}catch{}assert.equal(resp.status,expected,`${method} ${route}: ${resp.status} ${text}`);checks++;return json}
const suffix=randomBytes(6).toString('hex');const password='Temp!'+randomBytes(18).toString('base64url');
const a=await request('/auth/register','POST',{fullName:'Overlap Test A',email:`overlap-a-${suffix}@test.invalid`,organization:'OVERLAP-A-'+suffix,password},null,201);
const b=await request('/auth/register','POST',{fullName:'Overlap Test B',email:`overlap-b-${suffix}@test.invalid`,organization:'OVERLAP-B-'+suffix,password},null,201);
await enrollSyntheticAdminMfa({token:a.accessToken,password,send:(route,token,body)=>request(route,'POST',body,token,201)});
await enrollSyntheticAdminMfa({token:b.accessToken,password,send:(route,token,body)=>request(route,'POST',body,token,201)});
const makeAsset=()=>request('/assets','POST',{assetType:'LAND',district:'Wakiso',declaredOwner:'Fictional test owner',description:'Disposable geo evidence'},a.accessToken,201);
const assetA=await makeAsset(),assetB=await makeAsset();
const geo1={type:'Polygon',coordinates:[[[32.57,.31],[32.59,.31],[32.59,.33],[32.57,.33],[32.57,.31]]]};
const geo2={type:'Polygon',coordinates:[[[32.58,.32],[32.60,.32],[32.60,.34],[32.58,.34],[32.58,.32]]]};
async function draft(asset,geometry){return request(`/geo/assets/${asset.id}/parcels`,'POST',{geometry,sourceKind:'CLIENT_SKETCH',sourceReference:'Fictional smoke test'},a.accessToken,201)}
const c1=await draft(assetA,geo1),c2=await draft(assetB,geo2);
const check=await request(`/geo/assets/${assetA.id}/parcels/${c1.id}/overlaps`,'GET',null,a.accessToken);
assert.deepEqual(check,[], 'Neither draft nor submitted geometry may be treated as accepted evidence');
await request(`/geo/assets/${assetA.id}/parcels/${c1.id}/overlaps`,'GET',null,b.accessToken,404);
await request(`/geo/assets/${assetB.id}/parcels/${c2.id}/overlaps`,'GET',null,b.accessToken,404);
console.log(`PASS ${checks} local overlap API assertions; only fictional test records ${suffix}`);
