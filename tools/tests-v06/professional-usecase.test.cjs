const {test}=require('node:test');const assert=require('node:assert/strict');
const {ReviewProfessionalApplication}=require('../.compiled-v06/application/trust-usecases.js');
const {TrustPolicyError}=require('../.compiled-v06/domain/trust-policy.js');
const APP={id:'a',applicantId:'owner',organizationId:'org-a',role:'SURVEYOR',state:'PENDING',expiresAt:60000};
class MemoryRepo{
 constructor(){this.app={...APP};this.reviews=[];this.final=[];this.audits=[];this.actors={r1:{id:'r1',organizationId:'trust-a',appointed:true,active:true,mfaEnabled:true},r2:{id:'r2',organizationId:'trust-b',appointed:true,active:true,mfaEnabled:true}};}
 async transaction(fn){return fn({getApplication:async()=>this.app,getActor:async id=>this.actors[id]||{id,organizationId:'',appointed:false,active:false,mfaEnabled:false},getReviews:async()=>[...this.reviews],saveDecision:async(_,reviewer,decision)=>{this.reviews.push({reviewerId:reviewer,decision})},finalize:async(_,outcome)=>{this.final.push(outcome);this.app.state=outcome},audit:async(...args)=>{this.audits.push(args)}})}
}
const run=(repo,actor,decision='VERIFIED')=>new ReviewProfessionalApplication(repo,()=>100).execute(actor,'a',decision,'Independent regulator lookup','REGISTRY-REF-1122','The relevant regulator confirmed this licence is current and valid.');
test('RED→GREEN: first external attestation cannot grant an accreditation',async()=>{const db=new MemoryRepo();const result=await run(db,db.actors.r1);assert.equal(result.status,'PENDING');assert.deepEqual(db.final,[])});
test('RED→GREEN: second independent authorized attestation approves once',async()=>{const db=new MemoryRepo();await run(db,db.actors.r1);const result=await run(db,db.actors.r2);assert.equal(result.status,'APPROVED');assert.deepEqual(db.final,['APPROVED']);assert.equal(db.audits.length,2)});
test('RED→GREEN: a rejection makes approval impossible',async()=>{const db=new MemoryRepo();await run(db,db.actors.r1);const result=await run(db,db.actors.r2,'REJECTED');assert.equal(result.status,'REJECTED');assert.deepEqual(db.final,['REJECTED']);await assert.rejects(()=>run(db,db.actors.r1),e=>e.code==='NOT_ALLOWED')});
test('RED→GREEN: no same-organization or self-review even if caller claims trust',async()=>{const db=new MemoryRepo();db.actors.r1.organizationId='org-a';await assert.rejects(()=>run(db,{...db.actors.r1,organizationId:'other-org'}),e=>e.code==='NOT_ALLOWED');assert.equal(db.reviews.length,0)});
test('RED→GREEN: authoritative role is loaded inside transaction, not from caller',async()=>{const db=new MemoryRepo();db.actors.r1.mfaEnabled=false;await assert.rejects(()=>run(db,{...db.actors.r1,mfaEnabled:true}),e=>e.code==='NOT_ALLOWED')});
test('RED→GREEN: duplicate review is disallowed in the application layer',async()=>{const db=new MemoryRepo();await run(db,db.actors.r1);await assert.rejects(()=>run(db,db.actors.r1),e=>e.code==='NOT_ALLOWED')});
test('RED→GREEN: missing application and bad decision are explicitly rejected',async()=>{const db=new MemoryRepo();db.app=null;await assert.rejects(()=>run(db,db.actors.r1),e=>e.code==='NOT_FOUND');await assert.rejects(()=>run(db,db.actors.r1,'APPROVED'),e=>e.code==='INVALID_DECISION')});
