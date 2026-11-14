'use strict';
/** Every open stage must have at least one reviewer, a distinct evidence
 * author, a stage-qualified assignee and an authorized advancer. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const ts=require('../test-typescript-loader.cjs');
const file=path.resolve(__dirname,'../../apps/api/src/contexts/verification/domain/evidence-policy.ts');
const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:()=>{throw Error('Domain importing infrastructure is forbidden')}},{filename:file,timeout:5000});
const p=mod.exports;
const roles=['ORG_ADMIN','CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'];
const actor=(role,approved=false)=>({id:'actor',organizationId:'org',role,professionalApproved:approved});
for(const stage of p.STAGES.filter(x=>x!=='CLOSED')){
 test(`${stage}: two-person evidence review and stage advancement are both satisfiable`,()=>{
  const authors=roles.flatMap(role=>[false,true].map(approved=>actor(role,approved)));
  const stageReviewers=authors.filter(a=>p.mayReviewEvidence(a,{stage,recorded_by:'different-human',review_status:'SUBMITTED'},stage));
  const stageAdvancers=authors.filter(a=>p.mayAdvanceStage(a,{id:'case',organizationId:'org',stage,status:'OPEN',assignedTo:'actor',createdBy:'creator'}));
  const eligibleAssignees=roles.filter(role=>p.canAssignCaseStage(stage,role));
  assert.ok(stageReviewers.length>0,`${stage} needs an authorized reviewer`);
  assert.ok(stageAdvancers.length>0,`${stage} needs an authorized advancer`);
  assert.ok(eligibleAssignees.length>0,`${stage} needs a stage-qualified assignee`);
  const submitted={stage,evidence_type:p.STAGE_REQUIRED_EVIDENCE[stage],recorded_by:'person-one',review_status:'ACCEPTED',reviewed_by:'person-two'};
  const final=p.evaluateReadiness(stageAdvancers[0],{id:'case',organizationId:'org',stage,status:'OPEN',assignedTo:'actor',createdBy:'creator'},[submitted],false);
  assert.equal(final.canAdvance,true,`${stage} should be reachable with independent accepted evidence`);
  assert.equal(final.nextStage,p.nextStage(stage));
 });
}
