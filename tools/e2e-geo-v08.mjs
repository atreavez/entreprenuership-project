/** v0.8 API/PostGIS smoke. Creates fictional records; localhost only. Never run against production. */
import assert from 'node:assert/strict';
import {assertSafeE2eTarget} from './e2e-safety.mjs';
import {randomBytes} from 'node:crypto';
const base=await assertSafeE2eTarget(process.env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000');let count=0;
async function req(path,method='GET',body,token,expected=200){const res=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});const txt=await res.text();const data=txt?JSON.parse(txt):{};assert.equal(res.status,expected,`${method} ${path}: expected ${expected}, got ${res.status} ${txt}`);count++;return data}
const key=randomBytes(5).toString('hex'),password='LocalTest!'+randomBytes(19).toString('base64url');
const a=await req('/auth/register','POST',{fullName:'Geo Tester A',organization:'GEO-A-'+key,email:'geo-a-'+key+'@test.invalid',password},undefined,201);
const b=await req('/auth/register','POST',{fullName:'Geo Tester B',organization:'GEO-B-'+key,email:'geo-b-'+key+'@test.invalid',password},undefined,201);
const asset=await req('/assets','POST',{assetType:'LAND',district:'Wakiso',declaredOwner:'Fictional owner for test',description:'Test-only parcel'},a.accessToken,201);
const geometry={type:'Polygon',coordinates:[[[32.57,.31],[32.58,.31],[32.58,.32],[32.57,.32],[32.57,.31]]]};
const draft=await req(`/geo/assets/${asset.id}/parcels`,'POST',{geometry,sourceKind:'CLIENT_SKETCH',sourceReference:'Fictional test outline'},a.accessToken,201);assert.equal(draft.status,'DRAFT');
const list=await req(`/geo/assets/${asset.id}/parcels`,'GET',undefined,a.accessToken);assert.equal(list.length,1);assert.ok(list[0].area_sqm>0);
await req(`/geo/assets/${asset.id}/parcels`,'GET',undefined,b.accessToken,404);
await req(`/geo/assets/${asset.id}/parcels/${draft.id}/submit`,'POST',{},a.accessToken,201);
const search=await req('/geo/parcels?bbox=32.5,0.2,32.7,0.4','GET',undefined,a.accessToken);
assert.ok(search.some(p=>p.id===draft.id));
const hidden=await req('/geo/parcels?bbox=32.5,0.2,32.7,0.4','GET',undefined,b.accessToken);assert.equal(hidden.some(p=>p.id===draft.id),false);
await req(`/geo/assets/${asset.id}/parcels/${draft.id}/review`,'POST',{decision:'ACCEPTED',reviewNotes:'I approve myself'},a.accessToken,403);
await req(`/geo/assets/${asset.id}/parcels`,'POST',{geometry:{type:'Polygon',coordinates:[[[32.57,.31],[32.58,.32],[32.57,.32],[32.58,.31],[32.57,.31]]]},sourceKind:'CLIENT_SKETCH'},a.accessToken,400);
console.log(`PASS ${count} local PostGIS/HTTP assertions; fictional test records ${key}`);
