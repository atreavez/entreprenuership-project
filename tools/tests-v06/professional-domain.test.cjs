const {test}=require('node:test');const assert=require('node:assert/strict');
const {canSubmitProfession,canAttest,resolveAttestations,isLiveAccreditation,validateLicenceExpiry,validateExternalVerification,TrustPolicyError}=require('../.compiled-v06/domain/trust-policy.js');
const application={id:'a',applicantId:'applicant',organizationId:'org-one',role:'SURVEYOR',state:'PENDING',expiresAt:200000000};
const staff={id:'reviewer-1',organizationId:'other-org',appointed:true,active:true,mfaEnabled:true};
test('a general administrator cannot claim to be accredited surveyor or lawyer',()=>{assert.equal(canSubmitProfession('ORG_ADMIN','SURVEYOR'),false);assert.equal(canSubmitProfession('REVIEWER','LEGAL_REVIEWER'),false);assert.equal(canSubmitProfession('SURVEYOR','SURVEYOR'),true)});
test('only active MFA enrolled appointed reviewers from another organization may attest',()=>{
 assert.equal(canAttest(staff,application,[],100),true);
 for(const change of [{appointed:false},{active:false},{mfaEnabled:false},{id:'applicant'},{organizationId:'org-one'}])assert.equal(canAttest({...staff,...change},application,[],100),false);
});
test('reviewer cannot vote twice',()=>assert.equal(canAttest(staff,application,[{reviewerId:'reviewer-1',decision:'VERIFIED'}],100),false));
test('expired / closed applications cannot be attested',()=>{assert.equal(canAttest(staff,{...application,expiresAt:99},[],100),false);assert.equal(canAttest(staff,{...application,state:'APPROVED'},[],100),false)});
test('two distinct verified reviewers are necessary to approve',()=>{
 assert.equal(resolveAttestations([]),'PENDING');
 assert.equal(resolveAttestations([{reviewerId:'r1',decision:'VERIFIED'}]),'PENDING');
 assert.equal(resolveAttestations([{reviewerId:'r1',decision:'VERIFIED'},{reviewerId:'r1',decision:'VERIFIED'}]),'PENDING');
 assert.equal(resolveAttestations([{reviewerId:'r1',decision:'VERIFIED'},{reviewerId:'r2',decision:'VERIFIED'}]),'APPROVED');
});
test('one rejected attestation blocks all approval',()=>assert.equal(resolveAttestations([{reviewerId:'r1',decision:'VERIFIED'},{reviewerId:'r2',decision:'REJECTED'}]),'REJECTED'));
test('accreditation must match the specific role, be unrevoked, and unexpired',()=>{
 const x={role:'SURVEYOR',expiresAt:200};assert.equal(isLiveAccreditation('SURVEYOR',x,100),true);
 assert.equal(isLiveAccreditation('LEGAL_REVIEWER',x,100),false);
 assert.equal(isLiveAccreditation('ORG_ADMIN',x,100),false);
 assert.equal(isLiveAccreditation('SURVEYOR',{...x,revokedAt:90},100),false);
 assert.equal(isLiveAccreditation('SURVEYOR',x,201),false);
});
test('claims enforce expiry window and meaningful verification descriptions',()=>{
 assert.throws(()=>validateLicenceExpiry('invalid',100),TrustPolicyError);
 assert.throws(()=>validateLicenceExpiry('1970-01-02',200000000),TrustPolicyError);
 assert.throws(()=>validateExternalVerification('guess','ref','ok'),TrustPolicyError);
 assert.doesNotThrow(()=>validateExternalVerification('Direct regulator check','REGULATOR-1234','Checked current active professional licence with the authority.'));
});
