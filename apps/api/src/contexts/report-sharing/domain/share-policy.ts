/** AssetTrust v0.39 private report sharing policy: no I/O, HTTP, framework or database imports. */
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

export const SHARE_NOTICE='This is confidential non-official verification evidence, not a land-title certificate. Share the two access credentials via separate trusted channels.';
export type ShareStatus='PENDING'|'ACTIVE'|'REJECTED'|'REVOKED';
export type ShareInput={reportId:string;recipientLabel:string;reason:string;expiresHours:number;maxDownloads:number};
export function strictObject(input:unknown,required:readonly string[]){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==required.length||Object.keys(input).some(k=>!required.includes(k)))throw Error('Unexpected or missing share fields');
 return input as Record<string,unknown>;
}
export function assertShareInput(value:unknown):ShareInput{
 const x=strictObject(value,['reportId','recipientLabel','reason','expiresHours','maxDownloads']);
 if(typeof x.reportId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x.reportId))throw Error('Invalid report UUID');
 if(typeof x.recipientLabel!=='string'||!/^[-A-Za-z0-9 .,'()]{3,80}$/.test(x.recipientLabel))throw Error('Recipient label must be 3–80 simple printable characters');
 if(typeof x.reason!=='string'||x.reason.trim().length<20||x.reason.length>500||/[<>\x00-\x1f\x7f]/.test(x.reason))throw Error('Sharing reason must be 20–500 plain-text characters');
 if(typeof x.expiresHours!=='number'||!Number.isInteger(x.expiresHours)||x.expiresHours<1||x.expiresHours>168)throw Error('Expiration must be 1–168 hours');
 if(typeof x.maxDownloads!=='number'||!Number.isInteger(x.maxDownloads)||x.maxDownloads<1||x.maxDownloads>5)throw Error('Maximum redemptions must be 1–5');
 return {reportId:x.reportId,recipientLabel:x.recipientLabel.trim(),reason:x.reason.trim(),expiresHours:x.expiresHours,maxDownloads:x.maxDownloads};
}
export function assertDecision(v:unknown):'APPROVE'|'REJECT'{if(v!=='APPROVE'&&v!=='REJECT')throw Error('Invalid share approval decision');return v;}
export function assertRevocationReason(v:unknown):string{
 if(typeof v!=='string'||v.trim().length<20||v.length>500||/[<>\x00-\x1f\x7f]/.test(v))throw Error('Revocation reason must be 20–500 plain-text characters');
 return v.trim();
}
export function newShareSecrets(){return {accessToken:randomBytes(32).toString('base64url'),accessCode:randomBytes(32).toString('base64url')};}
const SECRET=/^[A-Za-z0-9_-]{43}$/;
export function shareSecretHash(kind:'TOKEN'|'CODE',secret:string){
 if(typeof secret!=='string'||!SECRET.test(secret))throw Error('Invalid share credential');
 return createHash('sha256').update(`ASSETTRUST-SHARE-${kind}-V1\0`).update(secret,'utf8').digest('hex');
}
export function matchShareSecrets(accessToken:unknown,accessCode:unknown,tokenHash:string,codeHash:string):boolean{
 // Do not leak which of the two independent secrets is incorrect.
 if(typeof accessToken!=='string'||typeof accessCode!=='string'||!SECRET.test(accessToken)||!SECRET.test(accessCode))return false;
 if(!/^[a-f0-9]{64}$/.test(tokenHash)||!/^[a-f0-9]{64}$/.test(codeHash))return false;
 const a=Buffer.from(shareSecretHash('TOKEN',accessToken),'hex'),b=Buffer.from(shareSecretHash('CODE',accessCode),'hex');
 const tokenMatches = timingSafeEqual(
    a,
    Buffer.from(tokenHash, 'hex')
  );
  const codeMatches = timingSafeEqual(
    b,
    Buffer.from(codeHash, 'hex')
  );
  return tokenMatches && codeMatches;
}
export function assertRedeemable(share:{status:string;expires_at:string|Date|null;max_downloads:number;download_count:number},now=new Date()){
 if(share.status!=='ACTIVE'||!share.expires_at||!(new Date(share.expires_at).getTime()>now.getTime()))throw Error('Share is unavailable');
 if(!Number.isInteger(Number(share.download_count))||Number(share.download_count)>=Number(share.max_downloads))throw Error('Share is unavailable');
 return true;
}
