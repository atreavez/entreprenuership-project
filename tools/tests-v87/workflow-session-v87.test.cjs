'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
class ForbiddenException extends Error{}
const nest={ForbiddenException,NotFoundException:class extends Error{},Injectable:()=>()=>{}};
function load(file,imports={}){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,{module:m,exports:m.exports,require:n=>{if(Object.hasOwn(imports,n))return imports[n];throw Error('Unexpected import '+n);}});
 return m.exports;
}
const access=load('contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
const {PostgresWorkflowRepository}=load('contexts/verification/infrastructure/postgres-workflow.repository.ts',{
 '@nestjs/common':nest,'../../../database':{},'../../../audit':{},
 '../../tenant-isolation/application/tenant-scope':{setTenantScope:async(tx,org)=>tx.query('scope',[org])},
 '../../access/infrastructure/transactional-access':access,
 './current-workflow-authorizer':{loadCurrentWorkflowActor:async()=>{throw Error('unused')}},
 '../../workflow-admin/domain/workflow-policy':{}
});
const actor={id:'12345678-1234-4234-8234-123456789abc',organizationId:'22345678-1234-4234-8234-123456789abc',role:'ORG_ADMIN',professionalApproved:false};
const sessionId='32345678-1234-4234-8234-123456789abc',caseId='42345678-1234-4234-8234-123456789abc';
function fixture(active=true,participant=true){
 const calls=[];const tx={query:async(sql,params)=>{calls.push({sql,params});if(sql==='scope')return {rows:[]};
 if(sql.includes('JOIN auth_sessions s'))return {rows:active?[{id:actor.id}]:[]};
 if(sql.includes('FROM verification_cases c JOIN users member'))return {rows:participant?[{id:caseId,organization_id:actor.organizationId,stage:'INTAKE',status:'OPEN',created_by:actor.id}]:[]};
 throw Error('Unexpected SQL');}};
 const repo=new PostgresWorkflowRepository({transaction:async fn=>fn(tx)},{});
 return {repo,calls};
}
test('missing or revoked workflow session cannot reach a case or evidence query',async()=>{
 const f=fixture(false);
 assert.throws(()=>f.repo.transaction(async()=>{}, {actor}),ForbiddenException);
 await assert.rejects(f.repo.transaction(async tx=>tx.getCase(caseId,actor.organizationId),{actor,sessionId}),ForbiddenException);
 assert.equal(f.calls.length,2);assert.match(f.calls[1].sql,/FOR SHARE OF actor,s/);
});
test('current case participation is enforced in the locked case locator',async()=>{
 const f=fixture(true,false);
 assert.equal(await f.repo.transaction(tx=>tx.getCase(caseId,actor.organizationId),{actor,sessionId}),null);
 const q=f.calls[2];
 assert.deepEqual(Array.from(q.params),[caseId,actor.organizationId,actor.id]);
 for(const term of ["member.role='ORG_ADMIN'",'c.created_by=member.id','c.assigned_to=member.id','member.organization_id=c.organization_id','FOR UPDATE OF c FOR SHARE OF member'])assert(q.sql.includes(term),term);
});
test('workflow rejects a different tenant before querying case records',async()=>{
 const f=fixture();
 await assert.rejects(f.repo.transaction(tx=>tx.getCase(caseId,'other'),{actor,sessionId}),ForbiddenException);
 assert.equal(f.calls.length,2);
});
