'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {signCheckpoint,verifyCheckpoint,compareCheckpoint}=require('../audit-checkpoint-v87.cjs');
const org='12345678-1234-4234-8234-123456789abc';
const other='22345678-1234-4234-8234-123456789abc';
function proof(head='a'.repeat(64),organizationId=org){
 return {kind:'LOCAL_AUDIT_COMMITMENT_NOT_BLOCKCHAIN',organizationId,head,
 proof:crypto.createHash('sha256').update('assettrust:v1:'+organizationId+':'+head).digest('hex')};
}
function keys(){return crypto.generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});}
test('offline signature verifies with independently supplied key, including empty chain',()=>{
 const k=keys();
 for(const p of [proof(),proof('GENESIS')]){
  const signed=signCheckpoint(p,k.privateKey);
  assert.equal(verifyCheckpoint(signed,k.publicKey),true);
  assert.equal(compareCheckpoint(signed,k.publicKey,p).headMatches,true);
 }
});
test('wrong key and modified tenant, head, proof, schema or signature cannot pass',()=>{
 const k=keys(),signed=signCheckpoint(proof(),k.privateKey);
 assert.equal(verifyCheckpoint(signed,keys().publicKey),false);
 for(const changes of [proof('b'.repeat(64)),proof('a'.repeat(64),other),{proof:'0'.repeat(64)},{schema:'fake'},{signature:'x'.repeat(86)+'=='},{signature:signed.signature+'\n'}]){
  assert.equal(verifyCheckpoint({...signed,...changes},k.publicKey),false);
 }
});
test('signing rejects malformed local digest and non-Ed25519 keys',()=>{
 const k=keys();
 assert.throws(()=>signCheckpoint({...proof(),proof:'0'.repeat(64)},k.privateKey),/digest mismatch/);
 const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 assert.throws(()=>signCheckpoint(proof(),rsa.privateKey),/Ed25519/);
 assert.equal(verifyCheckpoint(signCheckpoint(proof(),k.privateKey),rsa.publicKey),false);
});
test('head mismatch is explicit without falsely claiming tampering or blockchain anchoring',()=>{
 const k=keys(),signed=signCheckpoint(proof(),k.privateKey);
 const result=compareCheckpoint(signed,k.publicKey,proof('GENESIS'));
 assert.equal(result.headMatches,false);
 assert.match(result.notice,/legitimate new events or a history change/);
 assert.throws(()=>compareCheckpoint(signed,k.publicKey,proof('a'.repeat(64),other)),/tenant mismatch/);
 assert.throws(()=>compareCheckpoint(signed,keys().publicKey,proof()),/trusted key invalid/);
});
