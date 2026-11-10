/** Pure domain policy: the file's MIME declaration does not establish authenticity. */
export class DocumentPolicyError extends Error { constructor(message:string){super(message);this.name='DocumentPolicyError';} }
export type SupportedMime = 'application/pdf'|'image/png'|'image/jpeg'|'image/webp';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const allowed:readonly SupportedMime[]=['application/pdf','image/png','image/jpeg','image/webp'];
export function assertAllowedDocument(bytes:Uint8Array,mime:string,size=bytes.byteLength):asserts mime is SupportedMime {
 if(!allowed.includes(mime as SupportedMime)) throw new DocumentPolicyError('Unsupported document type');
 if(size<1||size>MAX_UPLOAD_BYTES||size!==bytes.byteLength)throw new DocumentPolicyError('Invalid document size');
 const has=(a:number[])=>a.every((b,i)=>bytes[i]===b);
 const pdf=has([0x25,0x50,0x44,0x46,0x2d]);
 const png=has([137,80,78,71,13,10,26,10]);
 const jpg=has([255,216,255]);
 const webp=has([82,73,70,70])&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
 const valid=mime==='application/pdf'?pdf:mime==='image/png'?png:mime==='image/jpeg'?jpg:webp;
 if(!valid)throw new DocumentPolicyError('File signature does not match declared document type');
}
export function assertStorageIdentity(id:string,orgId:string,sha:string){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(id)||!uuid.test(orgId)||!/^[0-9a-f]{64}$/i.test(sha))throw new DocumentPolicyError('Invalid storage identity');
}
export function requireEncryptedFormat(format:string){
 if(format!=='AES_256_GCM_V1')throw new DocumentPolicyError('Legacy unencrypted document must be migrated before access');
}
