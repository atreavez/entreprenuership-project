import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStage,authorizeStage } from '../src/cases';
const regular={id:'x',organizationId:'o',email:'r@example.com',fullName:'Reviewer',role:'REVIEWER' as const,professionalApproved:false};
test('a case progresses only through ordered stages',()=>{
 assert.equal(nextStage('INTAKE'),'DOCUMENT_REVIEW');
 assert.equal(nextStage('FIELD_INSPECTION'),'LEGAL_REVIEW');
 assert.equal(nextStage('FINAL_REVIEW'),'CLOSED');
 assert.throws(()=>nextStage('CLOSED'));
});
test('ordinary reviewer cannot approve legal evidence',()=>{
 assert.throws(()=>authorizeStage(regular,'LEGAL_REVIEW'));
 assert.doesNotThrow(()=>authorizeStage(regular,'DOCUMENT_REVIEW'));
});
test('final-review stage permission requires an organization administrator',()=>{
 assert.doesNotThrow(()=>authorizeStage({...regular,role:'ORG_ADMIN'},'FINAL_REVIEW'));
 assert.throws(()=>authorizeStage(regular,'FINAL_REVIEW'));
 assert.throws(()=>authorizeStage({...regular,role:'LEGAL_REVIEWER',professionalApproved:true},'FINAL_REVIEW'));
});
test('legal-review stage permission still requires an accredited legal reviewer',()=>{
 assert.throws(()=>authorizeStage({...regular,role:'ORG_ADMIN'},'LEGAL_REVIEW'));
 assert.throws(()=>authorizeStage({...regular,role:'LEGAL_REVIEWER'},'LEGAL_REVIEW'));
 assert.doesNotThrow(()=>authorizeStage({...regular,role:'LEGAL_REVIEWER',professionalApproved:true},'LEGAL_REVIEW'));
});
