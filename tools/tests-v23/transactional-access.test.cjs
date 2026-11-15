'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const file=path.resolve(__dirname,'../../apps/api/src/contexts/access/infrastructure/transactional-access.ts');
const actor={id:'actor-23',organizationId:'org-23'};
class ForbiddenException extends Error{}
class NotFoundException extends Error{}
function moduleUnderTest(){
 const raw=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(raw,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const sandbox={exports:{},module:{exports:{}},require:id=>{
  if(id==='@nestjs/common')return {ForbiddenException,NotFoundException};
  throw Error('Unexpected import: '+id);
 },console}; sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(js,sandbox,{timeout:5000,filename:file});
 return sandbox.module.exports;
}
function fixture({role='CLIENT',creator='another-user',caseAccess=false,grant='CONTRIBUTE',grantExpired=false,hasAsset=true,hasUser=true}={}){
 const sql=[];
 const db={query:async(q,p)=>{
  sql.push(q);
  if(/FROM assets a\s+JOIN users actor/i.test(q))return {rows:hasAsset&&hasUser?[{id:p[0],asset_type:'LAND',created_by:creator,role}]:[]};
  if(/FROM verification_cases c\s+WHERE/i.test(q))return {rows:caseAccess?[{id:'case-23'}]:[]};
  if(/FROM resource_grants g\s+WHERE/i.test(q))return {rows:grant==='CONTRIBUTE'&&!grantExpired?[{id:'grant-23'}]:[]};
  throw Error('Unexpected SQL: '+q);
 }};return {db,sql};
}
test('RED/GREEN: a revoked asset grant cannot authorize a transactional write',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();const f=fixture({grant:null});
 await assert.rejects(()=>requireCurrentAssetContribution(f.db,actor,'asset-23'),ForbiddenException);
});
test('expired asset grant does not authorize a write',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();const f=fixture({grantExpired:true});
 await assert.rejects(()=>requireCurrentAssetContribution(f.db,actor,'asset-23'),ForbiddenException);
});
test('READ-only asset grant cannot authorize contribution',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();const f=fixture({grant:'READ'});
 await assert.rejects(()=>requireCurrentAssetContribution(f.db,actor,'asset-23'),ForbiddenException);
});
test('active CONTRIBUTEl grant authorizes a write and is locked against revocation',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();const f=fixture();const asset=await requireCurrentAssetContribution(f.db,actor,'asset-23');
 assert.equal(asset.assetType,'LAND');assert.ok(f.sql.some(q=>/FROM resource_grants g/i.test(q)&&/FOR SHARE/i.test(q)&&/g\.permission='CONTRIBUTE'/i.test(q)&&/g\.expires_at>now\(\)/i.test(q)));
});
test('current ORG_ADMIN or asset creator is authorized without a grant',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();
 for(const input of [{role:'ORG_ADMIN',grant:null},{creator:actor.id,grant:null}]){const f=fixture(input);await requireCurrentAssetContribution(f.db,actor,'asset-23');assert.ok(!f.sql.some(q=>/FROM resource_grants g/i.test(q)));}
});
test('current case creator/assignee may contribute and its case row is locked',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();const f=fixture({caseAccess:true,grant:null});await requireCurrentAssetContribution(f.db,actor,'asset-23');
 assert.ok(f.sql.some(q=>/FROM verification_cases c/i.test(q)&&/FOR SHARE/i.test(q)));
});
test('stale organization membership or missing asset must not authorize a write',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();
 for(const input of [{hasUser:false},{hasAsset:false}]){const f=fixture(input);await assert.rejects(()=>requireCurrentAssetContribution(f.db,actor,'asset-23'),NotFoundException);}
});
test('review-grade checks can lock asset exclusively to serialize competing approvals',async()=>{
 const {requireCurrentAssetContribution}=moduleUnderTest();const f=fixture();await requireCurrentAssetContribution(f.db,actor,'asset-23',{lockAssetForReview:true});
 assert.match(f.sql[0],/FOR UPDATE OF a/i);assert.match(f.sql[0],/FOR SHARE OF actor/i);
});
test('a confidential case file requires current case participation or an admin role',async()=>{
 const {requireCurrentCaseContribution}=moduleUnderTest();
 let query=''; const db={query:async sql=>{query=sql;return {rows:[]};}};
 await assert.rejects(()=>requireCurrentCaseContribution(db,actor,'case-23'),ForbiddenException);
 assert.match(query,/FOR SHARE OF c,actor/i);
});
test('document/parcel writes invoke transactional authorization, not solely controller prechecks',()=>{
 const root=path.resolve(__dirname,'../../apps/api/src');
 const parcel=fs.readFileSync(path.join(root,'contexts/geospatial/infrastructure/pg-parcel.repository.ts'),'utf8');
 const docs=fs.readFileSync(path.join(root,'documents.ts'),'utf8');
 for(const method of ['create','submit','review']){
  const i=parcel.indexOf('async '+method+'(');
  const j=parcel.indexOf('\n async ',i+7);
  assert.match(parcel.slice(i,j<0?undefined:j),/requireCurrentAssetContribution\(tx,/i,`${method} must check permissions inside its transaction`);
 }
 assert.match(docs,/this\.db\.transaction\(async tx\s*=>\s*\{[\s\S]{0,900}requireCurrentAssetContribution\(tx,/);
 assert.match(docs,/requireCurrentCaseContribution\(tx,/);
});
