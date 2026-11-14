/* Offline verification of the *real* pure evidence policy. Does not require npm packages. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');let ts;try{ts=require('typescript')}catch{ts=require(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}
const repo=path.join(__dirname,'..');
const input=fs.readFileSync(path.join(repo,'apps/api/src/contexts/verification/domain/evidence-policy.ts'),'utf8');
const code=ts.transpile(input,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
const ctx={exports:{}};vm.runInNewContext(code,ctx,{timeout:1500});const policy=ctx.exports;
let checks=0;function test(desc,fn){fn();checks++;console.log('✓ '+desc)}
const author={id:'submitter',role:'REVIEWER',professionalApproved:false};
const rev={id:'other',role:'REVIEWER',professionalApproved:false};
const survey={id:'surveyor',role:'SURVEYOR',professionalApproved:true};
const lawyer={id:'lawyer',role:'LEGAL_REVIEWER',professionalApproved:true};
const admin={id:'admin',role:'ORG_ADMIN',professionalApproved:true};
const ev=(stage,type,review_status='SUBMITTED',reviewed_by=null)=>({stage,evidence_type:type,review_status,reviewed_by,recorded_by:'submitter'});
test('evidence submission alone cannot unlock a stage',()=>assert.equal(policy.hasIndependentAcceptedEvidence('INTAKE',[ev('INTAKE','IDENTITY')]),false));
test('a rejected entry cannot unlock a stage',()=>assert.equal(policy.hasIndependentAcceptedEvidence('INTAKE',[ev('INTAKE','IDENTITY','REJECTED','other')]),false));
test('an accepted entry with a different reviewer unlocks matching stage',()=>assert.equal(policy.hasIndependentAcceptedEvidence('INTAKE',[ev('INTAKE','IDENTITY','ACCEPTED','other')]),true));
test('self-attestation never unlocks a stage',()=>assert.equal(policy.hasIndependentAcceptedEvidence('INTAKE',[ev('INTAKE','IDENTITY','ACCEPTED','submitter')]),false));
test('unrelated evidence types never unlock a stage',()=>assert.equal(policy.hasIndependentAcceptedEvidence('LEGAL_REVIEW',[ev('LEGAL_REVIEW','OTHER','ACCEPTED','lawyer')]),false));
test('a different stage cannot reuse evidence',()=>assert.equal(policy.hasIndependentAcceptedEvidence('FINAL_REVIEW',[ev('LEGAL_REVIEW','DECISION','ACCEPTED','admin')]),false));
test('submitter cannot review their own evidence',()=>assert.equal(policy.mayReviewEvidence(author,ev('DOCUMENT_REVIEW','DOCUMENT'),'DOCUMENT_REVIEW'),false));
test('another authorized reviewer may accept a pending entry',()=>assert.equal(policy.mayReviewEvidence(rev,ev('DOCUMENT_REVIEW','DOCUMENT'),'DOCUMENT_REVIEW'),true));
test('finalized decisions cannot be overwritten',()=>assert.equal(policy.mayReviewEvidence(rev,ev('DOCUMENT_REVIEW','DOCUMENT','REJECTED','admin'),'DOCUMENT_REVIEW'),false));
test('reviewing future-stage evidence is forbidden',()=>assert.equal(policy.mayReviewEvidence(rev,ev('DOCUMENT_REVIEW','DOCUMENT'),'REGISTRY_SEARCH'),false));
test('unapproved surveyors cannot verify field evidence',()=>assert.equal(policy.isStageReviewer({...survey,professionalApproved:false},'FIELD_INSPECTION'),false));
test('approved surveyors can verify field evidence',()=>assert.equal(policy.isStageReviewer(survey,'FIELD_INSPECTION'),true));
test('surveyors cannot approve legal review',()=>assert.equal(policy.isStageReviewer(survey,'LEGAL_REVIEW'),false));
test('approved legal reviewers can approve legal evidence',()=>assert.equal(policy.isStageReviewer(lawyer,'LEGAL_REVIEW'),true));
test('v0.26 final decision requires independent organization administrator, after accredited legal-stage review',()=>{assert.equal(policy.isStageReviewer({...admin,professionalApproved:false},'FINAL_REVIEW'),true);assert.equal(policy.isStageReviewer(lawyer,'FINAL_REVIEW'),false);assert.equal(policy.isStageReviewer(rev,'FINAL_REVIEW'),false);assert.equal(policy.isStageReviewer(lawyer,'LEGAL_REVIEW'),true)});
// Configuration regression guard: test snippets against routes and SQL, not database behavior.
const cases=fs.readFileSync(path.join(repo,'apps/api/src/cases.ts'),'utf8');
const sql=fs.readFileSync(path.join(repo,'apps/api/sql/003_evidence_review.sql'),'utf8');
test('review API and stage guard call the approved-evidence policy',()=>{assert.match(cases,/reviewEvidence\(/);assert.match(cases,/this\.workflow\.advance\(u,caseId\)/);assert.match(cases,/@Post\(':id\/evidence\/:evidenceId\/review'\)/)});
test('migration explicitly records reviewed_by and review status',()=>{assert.match(sql,/ADD COLUMN IF NOT EXISTS review_status/);assert.match(sql,/ADD COLUMN IF NOT EXISTS reviewed_by/)});
console.log(`\nPASS: ${checks} offline policy and structural checks.`)
