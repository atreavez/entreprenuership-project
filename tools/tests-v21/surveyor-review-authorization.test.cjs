'use strict';
/** v0.21 regression tests execute the actual repository TS after transpilation.
 * Simulated SQL adapter, not live PostgreSQL. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
const {randomUUID}=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');
const repositoryPath=path.resolve(__dirname,'../../apps/api/src/contexts/geospatial/infrastructure/pg-parcel.repository.ts');
const source=fs.readFileSync(repositoryPath,'utf8');
const sqlBlock=source.slice(source.indexOf('async review('),source.indexOf('async overlaps('));
const decorator=()=>()=>{};
const stubs={
 '@nestjs/common':{Injectable:decorator,BadRequestException:class extends Error{},ForbiddenException:class extends Error{},NotFoundException:class extends Error{},ConflictException:class extends Error{}},
 '../../../contexts/tenant-isolation/application/tenant-scope':{setTenantScope:async()=>{}},
 '../../../database':{},'../../../audit':{},'../../../common':{uid:randomUUID,isUuid:x=>x},
 '../domain/parcel-boundary':{canReviewBoundary:()=>true}
};
const accessPath=path.resolve(__dirname,'../../apps/api/src/contexts/access/infrastructure/transactional-access.ts');
const accessJs=ts.transpileModule(fs.readFileSync(accessPath,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const accessContext={module:{exports:{}},exports:{},require:name=>stubs[name]??require(name)};accessContext.exports=accessContext.module.exports;
vm.runInNewContext(accessJs,accessContext,{filename:accessPath,timeout:5000});
stubs['../../../contexts/access/infrastructure/transactional-access']=accessContext.module.exports;
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
function fixture({activeMfa=true,liveAccreditation=true,correctRole=true,correctOrganization=true}={}){
 const queries=[];let writes=0,committed=false;
 const db={transaction:async callback=>{
  const result=await callback({query:async(sql,params=[])=>{
   queries.push({sql,params});
   if(sql.includes('FROM auth_sessions')){
    // Model the previous dangerous behavior: an old MFA-only SELECT would succeed
    // even if the professional accreditation was revoked or the role changed.
    const accreditationJoined=/JOIN\s+professional_accreditations\s+\w+/i.test(sql);
    const accreditationChecked=accreditationJoined&&/\.revoked_at\s+IS\s+NULL/i.test(sql)&&/\.expires_at\s*>\s*now\(\)/i.test(sql);
    const roleChecked=/\.role\s*=\s*'SURVEYOR'/i.test(sql);
    const organizationChecked=/\.organization_id\s*=\s*\$3/i.test(sql);
    const admissible=activeMfa&&(!accreditationChecked||liveAccreditation)&&(!roleChecked||correctRole)&&(!organizationChecked||correctOrganization);
    return {rows:admissible?[{ok:true}]:[],rowCount:admissible?1:0};
   }
   if(sql.includes('FROM assets'))return {rows:[{id:'asset-21',asset_type:'LAND',created_by:'surveyor-21',role:'SURVEYOR'}]};
   if(sql.includes('FROM parcel_boundary_claims'))return {rows:[{submitted_by:'other-person',status:'SUBMITTED'}]};
   if(sql.includes('UPDATE parcel_boundary_claims')){writes++;return {rows:[],rowCount:1}};
   throw new Error(`Unexpected SQL in parcel review: ${sql}`);
  }});
  committed=true;return result;
 }};
 const sandbox={module:{exports:{}},exports:{},require:name=>stubs[name]??require(name),Buffer,console,Date};
 sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(js,sandbox,{filename:repositoryPath,timeout:5000});
 const {PgParcelRepository}=sandbox.module.exports;
 const repo=new PgParcelRepository(db,{write:async()=>{}});
 const actor={id:'surveyor-21',organizationId:'org-21',role:'SURVEYOR',professionalApproved:true};
 return {queries,get writes(){return writes},get committed(){return committed},run:()=>repo.review(actor,'session-21','asset-21','claim-21','REJECTED','Survey documentation needs independent verification')};
}
// These negative cases MUST fail with the old v20 query, where the review is
// authorized by cached actor.professionalApproved and old MFA timestamps alone.
test('RED -> GREEN: stale cached accreditation cannot approve a review after revocation',async()=>{
 const f=fixture({liveAccreditation:false});await assert.rejects(()=>f.run(),/Fresh MFA verification required/);assert.equal(f.writes,0);
});
test('expired accreditation blocks a survey decision even if actor was previously approved',async()=>{
 const f=fixture({liveAccreditation:false});await assert.rejects(()=>f.run());assert.equal(f.writes,0);
});
test('role changed in database cannot be bypassed with old cached SURVEYOR role',async()=>{
 const f=fixture({correctRole:false});await assert.rejects(()=>f.run());assert.equal(f.writes,0);
});
test('organization changed in database cannot be bypassed with old JWT organization',async()=>{
 const f=fixture({correctOrganization:false});await assert.rejects(()=>f.run());assert.equal(f.writes,0);
});
test('legitimate independent accredited surveyor with MFA can reject claim',async()=>{
 const f=fixture();const response=await f.run();assert.equal(response.status,'REJECTED');assert.equal(f.writes,1);
});
test('MFA disabled blocks the review even if accreditation is valid',async()=>{
 const f=fixture({activeMfa:false});await assert.rejects(()=>f.run());assert.equal(f.writes,0);
});
test('authorization requires transaction-scoped joins and row locks on MFA, session, user and accreditation',()=>{
 assert.match(sqlBlock,/JOIN\s+professional_accreditations\s+(\w+)/);
 assert.match(sqlBlock,/revoked_at\s+IS\s+NULL/);
 assert.match(sqlBlock,/expires_at\s*>\s*now\(\)/);
 assert.match(sqlBlock,/FOR SHARE OF\s+s,m,u,p/);
 assert.match(sqlBlock,/u\.role\s*=\s*'SURVEYOR'/);
 assert.match(sqlBlock,/u\.organization_id\s*=\s*\$3/);
});
test('review still requires another person and submitted claim status',()=>{
 assert.match(sqlBlock,/canReviewBoundary\(u,claim\.rows\[0\]\.submitted_by\)/);
 assert.match(sqlBlock,/claim\.rows\[0\]\.status\s*!==\s*'SUBMITTED'/);
});
