/**
 * AssetTrust private non-official evidence bundle, v1.
 * Cryptographic provenance is NOT a certification of ownership, not a PDF signature,
 * and does not freeze the current public status of a withdrawn/superseded report.
 * No database, framework or transport dependencies.
 */
import {createHash,createPrivateKey,createPublicKey,sign as edSign,verify as edVerify,timingSafeEqual,type KeyObject} from 'node:crypto';
import {canonicalSnapshot,REPORT_LEGAL_STATUS,REPORT_NOTICE} from './report-policy';

export const ATTESTATION_SCHEMA='ASSETTRUST_SIGNED_EVIDENCE_BUNDLE_V1' as const;
export const ATTESTATION_CONTEXT='ASSETTRUST-SIGNED-EVIDENCE-BUNDLE-V1\n';
export type StatusAtExport='ISSUED'|'SUPERSEDED'|'UNDER_REVIEW'|'WITHDRAWN';
export type BundlePayload={
 schema:typeof ATTESTATION_SCHEMA;reportId:string;issuedAt:string;exportedAt:string;
 snapshotSha256:string;legalStatus:typeof REPORT_LEGAL_STATUS;notice:string;
 statusAtExport:StatusAtExport;statusNotice:string;verificationPath:string;snapshot:unknown;
};
export type SignedBundle={schema:typeof ATTESTATION_SCHEMA;keyId:string;algorithm:'Ed25519';payload:BundlePayload;signatureBase64:string};
const HEX64=/^[0-9a-f]{64}$/;
const KEY_ID=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=(txt:string)=>createHash('sha256').update(txt,'utf8').digest('hex');
const DATE=(txt:string)=>typeof txt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(txt)&&Number.isFinite(Date.parse(txt));
function validKeyId(id:unknown):asserts id is string {if(typeof id!=='string'||!KEY_ID.test(id))throw Error('Signing key ID must use 3–64 lowercase alphanumeric, dash, dot or underscore characters');}
function cleanBase64(value:unknown,maxLength:number):Buffer{
 if(typeof value!=='string'||value.length<4||value.length>maxLength||!/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(value))throw Error('Invalid canonical base64 signing key or signature');
 const raw=Buffer.from(value,'base64');if(raw.toString('base64')!==value)throw Error('Invalid base64 encoding');return raw;
}
export function importPrivateSigningKey(derB64:string):KeyObject{
 const key=createPrivateKey({key:cleanBase64(derB64,4096),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ed25519')throw Error('Only Ed25519 signing keys are supported');return key;
}
export function importPublicSigningKey(derB64:string):KeyObject{
 const key=createPublicKey({key:cleanBase64(derB64,2048),format:'der',type:'spki'});
 if(key.asymmetricKeyType!=='ed25519')throw Error('Only Ed25519 public keys are supported');return key;
}
export function publicKeyDescription(keyId:string,privateDerB64:string){
 validKeyId(keyId);const publicDer=createPublicKey(importPrivateSigningKey(privateDerB64)).export({format:'der',type:'spki'}) as Buffer;
 return {keyId,algorithm:'Ed25519' as const,spkiDerBase64:publicDer.toString('base64'),sha256:createHash('sha256').update(publicDer).digest('hex'),notice:'Pin and confirm this public-key fingerprint through a trusted independent channel before relying on downloaded signatures.'};
}
export function assertBundlePayload(payload:unknown):asserts payload is BundlePayload{
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid signed payload');
 const p=payload as Record<string,unknown>;
 const fields=['schema','reportId','issuedAt','exportedAt','snapshotSha256','legalStatus','notice','statusAtExport','statusNotice','verificationPath','snapshot'];
 if(Object.keys(p).length!==fields.length||Object.keys(p).some(x=>!fields.includes(x)))throw Error('Unexpected or missing signed payload fields');
 if(p.schema!==ATTESTATION_SCHEMA||typeof p.reportId!=='string'||!UUID4.test(p.reportId))throw Error('Invalid report reference or schema');
 if(!DATE(p.issuedAt as string)||!DATE(p.exportedAt as string))throw Error('Invalid signed report timestamps');
 if(typeof p.snapshotSha256!=='string'||!HEX64.test(p.snapshotSha256))throw Error('Invalid snapshot digest');
 if(p.legalStatus!==REPORT_LEGAL_STATUS||p.notice!==REPORT_NOTICE)throw Error('The non-official report notice must remain unchanged');
 if(!['ISSUED','SUPERSEDED','UNDER_REVIEW','WITHDRAWN'].includes(p.statusAtExport as string))throw Error('Unsupported report status');
 if(typeof p.statusNotice!=='string'||p.statusNotice.length<20||p.statusNotice.length>350)throw Error('Missing current-status caution');
 if(p.verificationPath!==`/#verify/report/${p.reportId}`)throw Error('Invalid public verification path');
 const canonical=canonicalSnapshot(p.snapshot);
 if(canonical.length>1_000_000)throw Error('Snapshot is too large for a signed export');
 const actual=Buffer.from(SHA(canonical),'hex'),expected=Buffer.from(p.snapshotSha256,'hex');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Signed bundle snapshot hash mismatch');
 const snap=p.snapshot as Record<string,unknown>;
 if(!snap||typeof snap!=='object'||Array.isArray(snap)||snap.reportType!=='ASSETTRUST_EVIDENCE_ISSUANCE_V1'||snap.legalStatus!==REPORT_LEGAL_STATUS||snap.legalNotice!==REPORT_NOTICE)throw Error('Snapshot is not an approved AssetTrust evidence report');
 if(p.statusAtExport!=='ISSUED'&&!/recheck|status|rely|current|withdraw|supersed/i.test(p.statusNotice))throw Error('Caution is required for a non-current report');
}
export function makeBundlePayload(input:{reportId:string;issuedAt:Date|string;snapshotSha256:string;snapshot:unknown;statusAtExport:StatusAtExport;exportedAt?:string}):BundlePayload{
 const payload={schema:ATTESTATION_SCHEMA,reportId:input.reportId,issuedAt:input.issuedAt instanceof Date?input.issuedAt.toISOString():input.issuedAt,
  exportedAt:input.exportedAt||new Date().toISOString(),snapshotSha256:input.snapshotSha256,legalStatus:REPORT_LEGAL_STATUS,notice:REPORT_NOTICE,
  statusAtExport:input.statusAtExport,statusNotice:'Status can change after export. Recheck the current public status before relying on this private evidence report.',
  verificationPath:`/#verify/report/${input.reportId}`,snapshot:input.snapshot};
 assertBundlePayload(payload);return payload;
}
export function signBundle(payload:BundlePayload,keyId:string,privateDerB64:string):SignedBundle{
 validKeyId(keyId);assertBundlePayload(payload);
 const data=Buffer.from(ATTESTATION_CONTEXT+canonicalSnapshot(payload),'utf8');
 const signature=edSign(null,data,importPrivateSigningKey(privateDerB64));
 return {schema:ATTESTATION_SCHEMA,keyId,algorithm:'Ed25519',payload,signatureBase64:signature.toString('base64')};
}
/** Trusted keys must come from an independently pinned keyring, NOT from an untrusted downloaded bundle. */
export function verifyBundle(bundle:unknown,trustedKeys:Record<string,string>):{ok:true;keyId:string;reportId:string;statusAtExport:StatusAtExport}{
 if(!bundle||typeof bundle!=='object'||Array.isArray(bundle))throw Error('Invalid signed bundle');
 const x=bundle as Record<string,unknown>;
 if(Object.keys(x).length!==5||Object.keys(x).some(k=>!['schema','keyId','algorithm','payload','signatureBase64'].includes(k)))throw Error('Invalid bundle fields');
 if(x.schema!==ATTESTATION_SCHEMA||x.algorithm!=='Ed25519')throw Error('Unsupported bundle schema or signature algorithm');
 validKeyId(x.keyId);
 if(!Object.prototype.hasOwnProperty.call(trustedKeys,x.keyId)||typeof trustedKeys[x.keyId]!=='string')throw Error('Untrusted signing key ID');
 assertBundlePayload(x.payload);
 const sig=cleanBase64(x.signatureBase64,128);
 if(sig.length!==64)throw Error('Invalid Ed25519 signature length');
 const data=Buffer.from(ATTESTATION_CONTEXT+canonicalSnapshot(x.payload),'utf8');
 if(!edVerify(null,data,importPublicSigningKey(trustedKeys[x.keyId]),sig))throw Error('Report signature invalid');
 return {ok:true,keyId:x.keyId,reportId:x.payload.reportId,statusAtExport:x.payload.statusAtExport};
}
