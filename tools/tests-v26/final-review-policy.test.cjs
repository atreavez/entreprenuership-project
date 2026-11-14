'use strict';
/** v0.26 TDD: the two-person FINAL_REVIEW must be possible for ordinary org
 * administrators, yet retain independent review, current role and evidence.
 * Executes the real framework-independent domain and application TypeScript. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const base=path.resolve(__dirname,'../../apps/api/src/contexts/verification');
function load(file,imports={}){
 const filename=path.join(base,file);
 const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(js,{module:mod,exports:mod.exports,require(id){if(Object.hasOwn(imports,id))return imports[id];throw Error('Unexpected module '+id);},console},{filename,timeout:5000});
 return mod.exports;
}
const policy=load('domain/evidence-policy.ts');
const workflowPolicy=load('../workflow-admin/domain/workflow-policy.ts',{'../../verification/domain/evidence-policy':policy});
const {EvidenceWorkflow}=load('application/evidence-workflow.ts',{'../domain/evidence-policy':policy,'../../workflow-admin/domain/workflow-policy':workflowPolicy});
const author={id:'admin-author',organizationId:'org-1',role:'ORG_ADMIN',professionalApproved:false};
const independentAdmin={id:'admin-reviewer',organizationId:'org-1',role:'ORG_ADMIN',professionalApproved:false};
const legal={id:'lawyer',organizationId:'org-1',role:'LEGAL_REVIEWER',professionalApproved:true};
const ordinaryReviewer={id:'reviewer',organizationId:'org-1',role:'REVIEWER',professionalApproved:false};
const reason='An independently documented final decision was checked against submitted records.';
function createRepo({stage='FINAL_REVIEW',recordedBy=author.id,decisionStatus='SUBMITTED',actorOverride,disputed=false}={}){
 const c={id:'case-1',organizationId:'org-1',assetId:'asset-1',stage,status:'OPEN',assignedTo:author.id,createdBy:author.id};
 const e={id:'e-1',stage,evidence_type:stage==='LEGAL_REVIEW'?'LEGAL_OPINION':'DECISION',recorded_by:recordedBy,review_status:decisionStatus,reviewed_by:decisionStatus==='ACCEPTED'?'another-person':null};
 const state={c,e,assetStatus:null,audit:[],reviewCount:0,actorChecks:0};
 const tx={
  getCase:async(id,org)=>c.id===id&&c.organizationId===org?{...c}:null,
  getCurrentActor:async(actor)=>{state.actorChecks++;return actorOverride?.[actor.id]||actor;},
  getEvidence:async(id)=>e.id===id?{...e}:null,
  getEvidenceForStage:async()=>[{...e}],
  hasUnresolvedDispute:async()=>disputed,
  recordDecision:async(id,actorId,decision)=>{state.reviewCount++;e.review_status=decision;e.reviewed_by=actorId;},
  changeStage:async(id,org,stage,status)=>{c.stage=stage;c.status=status;},
  completeAsset:async()=>{state.assetStatus='REVIEW_COMPLETED';},
  audit:async(actor,action,caseId,details)=>{state.audit.push({actor,action,caseId,details});}
 };
 return {...state,workflow:new EvidenceWorkflow({transaction:async callback=>callback(tx)}),state};
}
function deniedCode(code){return e=>e?.code===code;}

test('RED: current ORG_ADMIN with no professional credential can close an independently accepted FINAL_REVIEW',async()=>{
 const f=createRepo({decisionStatus:'ACCEPTED'});
 await f.workflow.advance(author,'case-1');
 assert.equal(f.c.stage,'CLOSED');assert.equal(f.c.status,'CLOSED');assert.equal(f.state.assetStatus,'REVIEW_COMPLETED');
 assert.equal(f.state.audit.at(-1)?.action,'CASE_STAGE_ADVANCED');assert.equal(f.state.actorChecks,1);
});
test('RED: a second administrator may independently accept FINAL_REVIEW decision evidence',async()=>{
 const f=createRepo();
 const result=await f.workflow.review(independentAdmin,'case-1','e-1','ACCEPTED',reason);
 assert.equal(result.decision,'ACCEPTED');assert.equal(f.e.reviewed_by,independentAdmin.id);
 assert.equal(f.state.audit[0]?.action,'EVIDENCE_REVIEWED');assert.equal(f.state.actorChecks,1);
});
test('RED: complete two-person final approval never asserts official land title',async()=>{
 const f=createRepo();
 await f.workflow.review(independentAdmin,'case-1','e-1','ACCEPTED',reason);
 const result=await f.workflow.advance(author,'case-1');
 assert.equal(result.status,'CLOSED');assert.equal(f.state.assetStatus,'REVIEW_COMPLETED');
 assert.match(result.notice,/neither approval nor an integrity hash is proof of legal title/i);
 assert.equal(f.state.audit.length,2);
});
test('self-review of final DECISION remains forbidden even for ORG_ADMIN',async()=>{
 const f=createRepo();
 await assert.rejects(()=>f.workflow.review(author,'case-1','e-1','ACCEPTED',reason),deniedCode('REVIEW_NOT_AUTHORIZED'));
 assert.equal(f.state.audit.length,0);
});
test('a ordinary REVIEWER cannot review or advance FINAL_REVIEW',async()=>{
 const f=createRepo();
 await assert.rejects(()=>f.workflow.review(ordinaryReviewer,'case-1','e-1','ACCEPTED',reason),deniedCode('REVIEW_NOT_AUTHORIZED'));
 await assert.rejects(()=>f.workflow.advance(ordinaryReviewer,'case-1'),deniedCode('STAGE_PERMISSION_DENIED'));
 assert.equal(f.c.stage,'FINAL_REVIEW');
});
test('a LEGAL_REVIEWER cannot view/approve final decision as a substitute for an organization administrator',async()=>{
 const f=createRepo();
 await assert.rejects(()=>f.workflow.review(legal,'case-1','e-1','ACCEPTED',reason),deniedCode('REVIEW_NOT_AUTHORIZED'));
 assert.equal(f.e.review_status,'SUBMITTED');
});
test('legal opinion at LEGAL_REVIEW still requires an accredited LEGAL_REVIEWER',()=>{
 const ev={stage:'LEGAL_REVIEW',evidence_type:'LEGAL_OPINION',recorded_by:'other',review_status:'SUBMITTED'};
 assert.equal(policy.mayReviewEvidence(legal,ev,'LEGAL_REVIEW'),true);
 assert.equal(policy.mayReviewEvidence(independentAdmin,ev,'LEGAL_REVIEW'),false);
 assert.equal(policy.mayReviewEvidence({...legal,professionalApproved:false},ev,'LEGAL_REVIEW'),false);
});
test('a revoked administrator role in the transaction cannot finalize a case',async()=>{
 const f=createRepo({decisionStatus:'ACCEPTED',actorOverride:{[author.id]:{...author,role:'CLIENT'}}});
 await assert.rejects(()=>f.workflow.advance(author,'case-1'),deniedCode('STAGE_PERMISSION_DENIED'));
 assert.equal(f.c.status,'OPEN');assert.equal(f.state.assetStatus,null);
});
test('FINAL_REVIEW cannot advance without accepted and independent DECISION evidence',async()=>{
 for(const status of ['SUBMITTED','REJECTED']){
  const f=createRepo({decisionStatus:status});
  await assert.rejects(()=>f.workflow.advance(author,'case-1'),deniedCode('EVIDENCE_NOT_ACCEPTED'));
  assert.equal(f.c.stage,'FINAL_REVIEW');
 }
});
test('unresolved dispute blocks final-stage closure even when evidence accepted',async()=>{
 const f=createRepo({decisionStatus:'ACCEPTED',disputed:true});
 await assert.rejects(()=>f.workflow.advance(author,'case-1'),deniedCode('DISPUTE_OPEN'));
 assert.equal(f.c.stage,'FINAL_REVIEW');
});
