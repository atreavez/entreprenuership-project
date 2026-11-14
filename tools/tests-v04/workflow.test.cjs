const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EvidenceWorkflow}=require('../.compiled-v04/application/evidence-workflow.js');
const {evaluateReadiness, mayReviewEvidence}=require('../.compiled-v04/domain/evidence-policy.js');
const admin={id:'administrator',organizationId:'tenant-a',role:'ORG_ADMIN',professionalApproved:true};
const other={id:'independent',organizationId:'tenant-a',role:'REVIEWER',professionalApproved:false};
const baseCase={id:'case-one',organizationId:'tenant-a',assetId:'asset-one',stage:'INTAKE',status:'OPEN',assignedTo:'administrator',createdBy:'administrator'};
const baseEvidence={id:'ev-one',stage:'INTAKE',evidence_type:'IDENTITY',recorded_by:'administrator',review_status:'SUBMITTED',reviewed_by:null};
class FakeRepository {
 constructor({caseRow={...baseCase},evidence=[{...baseEvidence}],disputed=false}={}){
  this.c=caseRow;this.e=evidence;this.disputed=disputed;this.events=[];this.assetStatus=null;this.transactions=0;
 }
 async transaction(work){this.transactions++;return work({
  getCurrentActor:async(actor)=>actor,
  getCase:async (id,org)=> this.c?.id===id&&this.c.organizationId===org?this.c:null,
  getEvidence:async(id,caseId,org)=>this.c?.id===caseId&&this.c.organizationId===org?this.e.find(e=>e.id===id)||null:null,
  getEvidenceForStage:async (id,org,stage)=>this.c?.id===id&&this.c.organizationId===org?this.e.filter(e=>e.stage===stage):[],
  hasUnresolvedDispute:async()=>this.disputed,
  recordDecision:async(id,actor,decision,notes)=>{const x=this.e.find(e=>e.id===id);x.review_status=decision;x.reviewed_by=actor;x.review_notes=notes;},
  changeStage:async (_id,_org,stage,status)=>{this.c.stage=stage;this.c.status=status;},
  completeAsset:async()=>{this.assetStatus='REVIEW_COMPLETED';},
  audit:async(actor,action,entity,details)=>{this.events.push({actor,action,entity,details});}
 });}
}
const ev=(o={})=>({...baseEvidence,...o});
const workflow=(f)=>new EvidenceWorkflow(f);
async function rejectsCode(fn,code){await assert.rejects(fn,e=>e.code===code);}
test('RED-to-GREEN: submitted evidence cannot advance a case',async()=>{
 const f=new FakeRepository();await rejectsCode(()=>workflow(f).advance(admin,'case-one'),'EVIDENCE_NOT_ACCEPTED');assert.equal(f.c.stage,'INTAKE');
});
test('independent review accepts evidence, emits audit, then permits advancement',async()=>{
 const f=new FakeRepository();await workflow(f).review(other,'case-one','ev-one','ACCEPTED','Identity evidence checked against source details');
 assert.equal(f.e[0].reviewed_by,'independent');assert.equal(f.events[0].action,'EVIDENCE_REVIEWED');
 await workflow(f).advance(admin,'case-one');assert.equal(f.c.stage,'DOCUMENT_REVIEW');assert.equal(f.events.at(-1).action,'CASE_STAGE_ADVANCED');
});
test('no one can review their own evidence',async()=>{
 const f=new FakeRepository();await rejectsCode(()=>workflow(f).review(admin,'case-one','ev-one','ACCEPTED','Testing independent review'),'REVIEW_NOT_AUTHORIZED');
});
test('rejected evidence cannot advance stage',async()=>{
 const f=new FakeRepository({evidence:[ev({review_status:'REJECTED',reviewed_by:'independent'})]});await rejectsCode(()=>workflow(f).advance(admin,'case-one'),'EVIDENCE_NOT_ACCEPTED');
});
test('wrong evidence type or wrong stage cannot advance',async()=>{
 const f=new FakeRepository({evidence:[ev({evidence_type:'OTHER',review_status:'ACCEPTED',reviewed_by:'independent'})]});await rejectsCode(()=>workflow(f).advance(admin,'case-one'),'EVIDENCE_NOT_ACCEPTED');
});
test('an active dispute blocks review and advancement',async()=>{
 const f=new FakeRepository({disputed:true});await rejectsCode(()=>workflow(f).review(other,'case-one','ev-one','ACCEPTED','Checking identity'), 'DISPUTE_OPEN');
 await rejectsCode(()=>workflow(f).advance(admin,'case-one'),'DISPUTE_OPEN');
});
test('closed case cannot be advanced',async()=>{
 const f=new FakeRepository({caseRow:{...baseCase,stage:'CLOSED',status:'CLOSED'}});await rejectsCode(()=>workflow(f).advance(admin,'case-one'),'CASE_NOT_OPEN');
});
test('professional verification cannot be advanced by unaccredited user',async()=>{
 const reviewer={...admin,professionalApproved:false};const f=new FakeRepository({caseRow:{...baseCase,stage:'LEGAL_REVIEW'},evidence:[ev({stage:'LEGAL_REVIEW',evidence_type:'LEGAL_OPINION',review_status:'ACCEPTED',reviewed_by:'independent'})]});
 await rejectsCode(()=>workflow(f).advance(reviewer,'case-one'),'STAGE_PERMISSION_DENIED');
});
test('assigned ordinary reviewer may not approve final decision',async()=>{
 const f=new FakeRepository({caseRow:{...baseCase,stage:'FINAL_REVIEW',assignedTo:'independent'},evidence:[ev({stage:'FINAL_REVIEW',evidence_type:'DECISION',review_status:'ACCEPTED',reviewed_by:'administrator'})]});
 await rejectsCode(()=>workflow(f).advance(other,'case-one'),'STAGE_PERMISSION_DENIED');
});
test('final stage completion never becomes an official ownership assertion',async()=>{
 const f=new FakeRepository({caseRow:{...baseCase,stage:'FINAL_REVIEW'},evidence:[ev({stage:'FINAL_REVIEW',evidence_type:'DECISION',recorded_by:'independent',review_status:'ACCEPTED',reviewed_by:'administrator'})]});
 await workflow(f).advance(admin,'case-one');assert.equal(f.c.stage,'CLOSED');assert.equal(f.assetStatus,'REVIEW_COMPLETED');
});
test('requests belonging to another tenant are not disclosed',async()=>{
 const f=new FakeRepository();await rejectsCode(()=>workflow(f).advance({...admin,organizationId:'tenant-b'},'case-one'),'CASE_NOT_FOUND');
});
test('readiness lists blockers without making a case decision',async()=>{
 const f=new FakeRepository();const r=await workflow(f).readiness(admin,'case-one');assert.equal(r.canAdvance,false);assert.ok(r.blockers.includes('EVIDENCE_NOT_ACCEPTED'));assert.equal(f.c.stage,'INTAKE');
});
