#!/usr/bin/env node
'use strict';
/** Offline verifier. Does NOT contact AssetTrust or trust any key embedded in an evidence bundle. */
const fs=require('node:fs');
const crypto=require('node:crypto');
const MAX_FILE=2*1024*1024;
const LEGAL_NOTICE='AssetTrust records are private verification evidence, not a government-issued title or proof of legal ownership. Verify official ownership with authorized government offices.';
const LEGAL_STATUS='PRIVATE_NON_OFFICIAL_EVIDENCE_REPORT';
const SCHEMA='ASSETTRUST_SIGNED_EVIDENCE_BUNDLE_V1';
const KEY=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function canonical(v){
 const visit=x=>{
  if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(typeof x==='number'&&Number.isFinite(x))return x;
  if(Array.isArray(x))return x.map(visit);
  if(x&&typeof x==='object'&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null)){
   const out={};for(const k of Object.keys(x).sort()){
    if(['__proto__','prototype','constructor'].includes(k))throw Error('Unsafe key');
    Object.defineProperty(out,k,{value:visit(x[k]),enumerable:true,writable:true,configurable:true});
   }return out;
  }
  throw Error('Invalid canonical JSON');
 };
 return JSON.stringify(visit(v));
}
function exactFields(o,fields){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===fields.length&&Object.keys(o).every(k=>fields.includes(k));}
function decode(value,max){
 if(typeof value!=='string'||value.length<4||value.length>max||!/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(value))throw Error('Invalid base64 encoding');
 const raw=Buffer.from(value,'base64');if(raw.toString('base64')!==value)throw Error('Invalid base64 encoding');return raw;
}
function validate(b,k){
 if(!exactFields(b,['schema','keyId','algorithm','payload','signatureBase64'])||b.schema!==SCHEMA||b.algorithm!=='Ed25519'||typeof b.keyId!=='string'||!KEY.test(b.keyId))throw Error('Invalid bundle schema or key ID');
 if(!k||typeof k!=='object'||Array.isArray(k)||!Object.prototype.hasOwnProperty.call(k,b.keyId))throw Error('Signing key not independently trusted');
 const p=b.payload;
 if(!exactFields(p,['schema','reportId','issuedAt','exportedAt','snapshotSha256','legalStatus','notice','statusAtExport','statusNotice','verificationPath','snapshot']))throw Error('Invalid signed payload fields');
 if(p.schema!==SCHEMA||typeof p.reportId!=='string'||!UUID.test(p.reportId)||p.legalStatus!==LEGAL_STATUS||p.notice!==LEGAL_NOTICE)throw Error('Invalid report identity or non-official disclosure');
 const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
 if(!date(p.issuedAt)||!date(p.exportedAt))throw Error('Invalid report dates');
 if(typeof p.snapshotSha256!=='string'||!/^[0-9a-f]{64}$/.test(p.snapshotSha256))throw Error('Invalid snapshot hash');
 if(!['ISSUED','UNDER_REVIEW','SUPERSEDED','WITHDRAWN'].includes(p.statusAtExport))throw Error('Invalid status');
 if(typeof p.statusNotice!=='string'||p.statusNotice.length<20||p.statusNotice.length>350||p.verificationPath!==`/#verify/report/${p.reportId}`)throw Error('Missing status caveat or public status path');
 if(p.statusAtExport!=='ISSUED'&&!/recheck|status|rely|current|withdraw|supersed/i.test(p.statusNotice))throw Error('Missing non-current warning');
 const snap=p.snapshot;
 if(!snap||typeof snap!=='object'||Array.isArray(snap)||snap.reportType!=='ASSETTRUST_EVIDENCE_ISSUANCE_V1'||snap.legalStatus!==LEGAL_STATUS||snap.legalNotice!==LEGAL_NOTICE)throw Error('Invalid private evidence snapshot');
 const c=canonical(snap);if(c.length>1_000_000)throw Error('Snapshot too large');
 const hash=crypto.createHash('sha256').update(c).digest();
 if(!crypto.timingSafeEqual(hash,Buffer.from(p.snapshotSha256,'hex')))throw Error('Report snapshot hash mismatch');
 const spki=decode(k[b.keyId],2048),pub=crypto.createPublicKey({key:spki,format:'der',type:'spki'});
 if(pub.asymmetricKeyType!=='ed25519')throw Error('Unsupported public key type');
 const sig=decode(b.signatureBase64,128);
 if(sig.length!==64||!crypto.verify(null,Buffer.from('ASSETTRUST-SIGNED-EVIDENCE-BUNDLE-V1\n'+canonical(p),'utf8'),pub,sig))throw Error('Invalid Ed25519 signature');
 return {reportId:p.reportId,keyId:b.keyId,statusAtExport:p.statusAtExport,keyFingerprint:crypto.createHash('sha256').update(spki).digest('hex')};
}
function readJson(file){if(fs.statSync(file).size>MAX_FILE)throw Error('Input exceeds the safety limit');return JSON.parse(fs.readFileSync(file,'utf8'));}
if(require.main===module){
 const [, ,file,trust]=process.argv;
 if(!file||!trust){console.error('Usage: node tools/verify-report-bundle-v36.cjs <bundle.json> <PINNED_PUBLIC_KEYS.json>');process.exit(2);}
 try{const result=validate(readJson(file),readJson(trust));console.log('SIGNATURE VALID: '+result.reportId+' | '+result.keyId+' | status at export: '+result.statusAtExport);console.log('Trusted public-key fingerprint (SHA-256): '+result.keyFingerprint);console.log('WARNING: Signature proves only that this key signed this private evidence bundle. Current status and ownership need independent verification.');}
 catch(e){console.error('VERIFICATION FAILED: '+(e instanceof Error?e.message:'invalid input'));process.exitCode=1;}
}
module.exports={validate,canonical};
