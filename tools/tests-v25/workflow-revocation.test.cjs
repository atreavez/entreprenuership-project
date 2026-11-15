'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const ts=require('../test-typescript-loader.cjs');const base=path.resolve(__dirname,'../../apps/api/src/contexts/verification');
function transpile(file,imports={}){
 const filename=path.join(base,file);const source=fs.readFileSync(filename,'utf8');
 const js=ts.transpileModule(source,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const ctx={module:{exports:{}},exports:{},require:id=>{if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected '+id)},console};ctx.exports=ctx.module.exports;
 vm.runInNewContext(js,ctx,{filename,timeout:5000});return ctx.module.exports;
}
const policy=transpile('domain/evidence-policy.ts');
const workflowPolicy=transpile('../workflow-admin/domain/workflow-policy.ts',{'../../verification/domain/evidence-policy':policy});
const {EvidenceWorkflow}=transpile('application/evidence-workflow.ts',{'../domain/evidence-policy':policy,'../../workflow-admin/domain/workflow-policy':workflowPolicy});
const admin={id:'admin',organizationId:'org',role:'ORG_ADMIN',professionalApproved:false};
const lawyer={id:'lawyer',organizationId:'org',role:'LEGAL_REVIEWER',professionalApproved:true};
const reviewer={id:'reviewer',organizationId:'org',role:'REVIEWER',professionalApproved:false};
function fixture(stage,current,rows){
 let writes=0,checks=0;const caseRow={id:'case',organizationId:'org',assetId:'asset',stage,status:'OPEN',assignedTo:'admin',createdBy:'admin'};
 const tx={
 getCase:async()=>caseRow,
 getCurrentActor:async()=>{checks++;return current},
 getEvidence:async()=>rows[0],
 getEvidenceForStage:async()=>rows,
 hasUnresolvedDispute:async()=>false,
 recordDecision:async()=>{writes++},changeStage:async()=>{writes++},completeAsset:async()=>{writes++},audit:async()=>{writes++}
 };return {workflow:new EvidenceWorkflow({transaction:async fn=>fn(tx)}),get writes(){return writes},get checks(){return checks}};
}
const ev=(stage,type,status='SUBMITTED')=>({id:'e',stage,evidence_type:type,recorded_by:'different',review_status:status,reviewed_by:status==='ACCEPTED'?'independent':null});
function hasCode(code){return err=>err?.code===code;}
test('a legally accredited reviewer whose approval is revoked before transaction cannot accept evidence',async()=>{
 const f=fixture('LEGAL_REVIEW',{...lawyer,professionalApproved:false},[ev('LEGAL_REVIEW','LEGAL_OPINION')]);
 await assert.rejects(()=>f.workflow.review(lawyer,'case','e','ACCEPTED','The external registry evidence was checked'),hasCode('REVIEW_NOT_AUTHORIZED'));
 assert.equal(f.writes,0);assert.equal(f.checks,1);
});
test('downgraded reviewer cannot accept evidence based on old token role',async()=>{
 const f=fixture('INTAKE',{...reviewer,role:'CLIENT'},[ev('INTAKE','IDENTITY')]);
 await assert.rejects(()=>f.workflow.review(reviewer,'case','e','ACCEPTED','External identity records verified'),hasCode('REVIEW_NOT_AUTHORIZED'));
 assert.equal(f.writes,0);
});
test('downgraded administrator cannot advance a case using old token role',async()=>{
 const f=fixture('FINAL_REVIEW',{...admin,role:'REVIEWER'},[ev('FINAL_REVIEW','DECISION','ACCEPTED')]);
 await assert.rejects(()=>f.workflow.advance(admin,'case'),hasCode('STAGE_PERMISSION_DENIED'));
 assert.equal(f.writes,0);assert.equal(f.checks,1);
});
test('current authorized legal reviewer can still independently review',async()=>{
 const f=fixture('LEGAL_REVIEW',lawyer,[ev('LEGAL_REVIEW','LEGAL_OPINION')]);
 await f.workflow.review(lawyer,'case','e','ACCEPTED','Independent report verified with regulator');
 assert.equal(f.writes,2);
});
test('current administrator may advance accepted stage',async()=>{
 const f=fixture('INTAKE',admin,[ev('INTAKE','IDENTITY','ACCEPTED')]);
 await f.workflow.advance(admin,'case');assert.equal(f.writes,2);
});
