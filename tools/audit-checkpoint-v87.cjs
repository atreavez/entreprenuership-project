'use strict';
// Offline audit commitment utility. No database, network or blockchain dependencies.
const crypto=require('node:crypto');
const KIND='LOCAL_AUDIT_COMMITMENT_NOT_BLOCKCHAIN';
const SCHEMA='ASSETTRUST_SIGNED_AUDIT_CHECKPOINT_V1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex=/^[0-9a-f]{64}$/;
function normalizeProof(p){
 if(!p||p.kind!==KIND||typeof p.organizationId!=='string'||!uuid.test(p.organizationId)||
  typeof p.head!=='string'||!(p.head==='GENESIS'||hex.test(p.head))||
  typeof p.proof!=='string'||!hex.test(p.proof))throw Error('Invalid local audit proof');
 const digest=crypto.createHash('sha256').update('assettrust:v1:'+p.organizationId+':'+p.head).digest('hex');
 if(p.proof!==digest)throw Error('Local proof digest mismatch');
 return {kind:KIND,organizationId:p.organizationId,head:p.head,proof:digest};
}
function payload(p){
 const v=normalizeProof(p);
 return Buffer.from(JSON.stringify([SCHEMA,v.organizationId,v.head,v.proof]),'utf8');
}
function publicKey(value){
 const k=crypto.createPublicKey(value);
 if(k.asymmetricKeyType!=='ed25519')throw Error('Ed25519 public key required');
 return k;
}
function signCheckpoint(proof,privatePem){
 const normalized=normalizeProof(proof);
 const key=crypto.createPrivateKey(privatePem);
 if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 private key required');
 return {schema:SCHEMA,...normalized,signature:crypto.sign(null,payload(normalized),key).toString('base64')};
}
function verifyCheckpoint(checkpoint,trustedPublicPem){
 if(!checkpoint||checkpoint.schema!==SCHEMA||typeof checkpoint.signature!=='string'||
  !/^[A-Za-z0-9+/]{86}==$/.test(checkpoint.signature))return false;
 const bytes=Buffer.from(checkpoint.signature,'base64');
 if(bytes.length!==64||bytes.toString('base64')!==checkpoint.signature)return false;
 try{return crypto.verify(null,payload(checkpoint),publicKey(trustedPublicPem),bytes);}
 catch{return false;}
}
function compareCheckpoint(checkpoint,trustedPublicPem,currentProof){
 if(!verifyCheckpoint(checkpoint,trustedPublicPem))throw Error('Checkpoint signature or trusted key invalid');
 const current=normalizeProof(currentProof);
 if(current.organizationId!==checkpoint.organizationId)throw Error('Checkpoint tenant mismatch');
 return {signatureVerified:true,headMatches:current.head===checkpoint.head,
  checkpointHead:checkpoint.head,currentHead:current.head,
  notice:'A different head may indicate legitimate new events or a history change; this comparison alone does not distinguish them. Signature is not a blockchain receipt or trusted timestamp.'};
}
module.exports={signCheckpoint,verifyCheckpoint,compareCheckpoint,normalizeProof};
if(require.main===module){
 const fs=require('node:fs');
 const [mode,...args]=process.argv.slice(2);
 const readJson=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 const readKey=f=>fs.readFileSync(f);
 try{
  if(mode==='sign'&&args.length===2){
   console.log(JSON.stringify(signCheckpoint(readJson(args[0]),readKey(args[1])),null,2));
  }else if(mode==='verify'&&args.length===2){
   const verified=verifyCheckpoint(readJson(args[0]),readKey(args[1]));
   console.log(JSON.stringify({signatureVerified:verified,blockchainAnchored:false}));
   if(!verified)process.exitCode=1;
  }else if(mode==='compare'&&args.length===3){
   const result=compareCheckpoint(readJson(args[0]),readKey(args[1]),readJson(args[2]));
   console.log(JSON.stringify(result,null,2));
   if(!result.headMatches)process.exitCode=2;
  }else{
   console.error('Usage: audit-checkpoint-v87.cjs sign proof.json private.pem | verify checkpoint.json trusted-public.pem | compare checkpoint.json trusted-public.pem current-proof.json');
   process.exitCode=1;
  }
 }catch{console.error('Audit checkpoint operation rejected; check input files, proof and key type.');process.exitCode=1;}
}
