#!/usr/bin/env node
'use strict';
/** Independent offline verification of detached AssetTrust PDF receipt; no npm or Internet required.
 * The independent public-key file must be obtained by a separate trusted channel.
 */
const fs=require('node:fs'),crypto=require('node:crypto');
const SCHEMA='ASSETTRUST_DETACHED_PDF_RECEIPT_V1';
const CTX='ASSETTRUST-DETACHED-PDF-RECEIPT-V1\n';
const LEGAL='AssetTrust records are private verification evidence, not a government-issued title or proof of legal ownership. Verify official ownership with authorized government offices.';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[a-z0-9][a-z0-9._-]{2,63}$/;
function exact(o,keys){return !!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));}
function canonical(v){
 const visit=x=>{if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(typeof x==='number'&&Number.isFinite(x))return x;if(Array.isArray(x))return x.map(visit);
  if(x&&typeof x==='object'&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null)){
   const result={};for(const k of Object.keys(x).sort()){
    if(['prototype','__proto__','constructor'].includes(k))throw Error('Unsafe key');
    Object.defineProperty(result,k,{value:visit(x[k]),enumerable:true,configurable:true,writable:true});
   }return result;
  }throw Error('Invalid canonical JSON');};return JSON.stringify(visit(v));
}
function b64(value,max){
 if(typeof value!=='string'||value.length<4||value.length>max||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Invalid base64');
 const data=Buffer.from(value,'base64');if(data.toString('base64')!==value)throw Error('Invalid canonical base64');return data;
}
function verify(pdf,receipt,keys){
 if(!Buffer.isBuffer(pdf)||pdf.length<100||pdf.length>3*1024*1024||pdf.subarray(0,8).toString()!=='%PDF-1.4')throw Error('Invalid PDF file');
 if(!exact(receipt,['schema','algorithm','keyId','payload','signatureBase64'])||receipt.schema!==SCHEMA||receipt.algorithm!=='Ed25519'||typeof receipt.keyId!=='string'||!KEY.test(receipt.keyId))throw Error('Invalid receipt');
 if(!keys||typeof keys!=='object'||Array.isArray(keys)||!Object.prototype.hasOwnProperty.call(keys,receipt.keyId))throw Error('Signing key not independently trusted');
 const p=receipt.payload;
 if(!exact(p,['schema','reportId','issuedAt','exportedAt','statusAtExport','snapshotSha256','pdfSha256','renderProfile','verificationPath','notice']))throw Error('Invalid receipt payload');
 const date=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
 if(p.schema!==SCHEMA||p.renderProfile!=='ASSETTRUST_A4_ASCII_V1'||p.notice!==LEGAL||!UUID.test(p.reportId)||!date(p.issuedAt)||!date(p.exportedAt)||!['ISSUED','SUPERSEDED','UNDER_REVIEW','WITHDRAWN'].includes(p.statusAtExport)||p.verificationPath!==`/#verify/report/${p.reportId}`)throw Error('Invalid report receipt identity, status or legal disclosure');
 if(typeof p.snapshotSha256!=='string'||typeof p.pdfSha256!=='string'||!/^([a-f0-9]{64})$/.test(p.snapshotSha256)||!/^([a-f0-9]{64})$/.test(p.pdfSha256))throw Error('Invalid document hashes');
 const actual=crypto.createHash('sha256').update(pdf).digest(),expected=Buffer.from(p.pdfSha256,'hex');
 if(!crypto.timingSafeEqual(actual,expected))throw Error('PDF bytes modified');
 const spki=b64(keys[receipt.keyId],2048);const key=crypto.createPublicKey({key:spki,format:'der',type:'spki'});
 if(key.asymmetricKeyType!=='ed25519')throw Error('Invalid trusted key algorithm');
 const sig=b64(receipt.signatureBase64,128);if(sig.length!==64||!crypto.verify(null,Buffer.from(CTX+canonical(p),'utf8'),key,sig))throw Error('Detached signature invalid');
 return {reportId:p.reportId,statusAtExport:p.statusAtExport,keyId:receipt.keyId,sha256:p.pdfSha256,keyFingerprint:crypto.createHash('sha256').update(spki).digest('hex')};
}
function readJson(file,max=2*1024*1024){if(fs.statSync(file).size>max)throw Error('Receipt or keyring too large');return JSON.parse(fs.readFileSync(file,'utf8'));}
if(require.main===module){
 const [,,pdfPath,receiptPath,pinnedPath]=process.argv;
 if(!pdfPath||!receiptPath||!pinnedPath){console.error('Usage: node tools/verify-report-pdf-v37.cjs <report.pdf> <report.receipt.json> <INDEPENDENTLY_PINNED_PUBLIC_KEYS.json>');process.exit(2)}
 try{
  if(fs.statSync(pdfPath).size>3*1024*1024)throw Error('PDF exceeds safety cap');
  const result=verify(fs.readFileSync(pdfPath),readJson(receiptPath),readJson(pinnedPath));
  console.log('PDF SIGNATURE RECEIPT VALID: '+result.reportId+' | '+result.statusAtExport+' at export | signer '+result.keyId);
  console.log('PDF SHA-256: '+result.sha256);console.log('Trusted key fingerprint: '+result.keyFingerprint);
  console.log('IMPORTANT: This is a detached PDF-byte signature, not PAdES. Evidence and live report status require separate review; this is not official ownership proof.');
 }catch(e){console.error('PDF VERIFICATION FAILED: '+(e instanceof Error?e.message:'Unknown error'));process.exitCode=1;}
}
module.exports={verify,canonical};
