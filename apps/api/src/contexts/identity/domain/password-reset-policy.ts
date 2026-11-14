/** AssetTrust identity domain - password recovery security policy. No HTTP/SQL/framework dependencies. */
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_MAX_REQUESTS = 3;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HEX_KEY = /^[a-f0-9]{64}$/i;
export function normalizeResetEmail(raw:unknown):string {
 if(typeof raw!=='string')throw new Error('Invalid email');
 const email=raw.trim().toLowerCase();
 if(email.length<5||email.length>200||!/^\S+@\S+\.\S+$/.test(email)||/[\r\n\0]/.test(email))throw new Error('Invalid email');
 return email;
}
export function makePasswordResetToken():string {return randomBytes(32).toString('base64url')}
export function validPasswordResetToken(token:unknown):token is string {
 if(typeof token!=='string'||!TOKEN_PATTERN.test(token))return false;
 const bytes=Buffer.from(token,'base64url');
 return bytes.length===32&&bytes.toString('base64url')===token;
}
export function passwordResetDigest(token:string):string {
 if(!validPasswordResetToken(token))throw new Error('Malformed recovery token');
 return createHash('sha256').update(token,'utf8').digest('hex');
}
export function lookupDigest(email:string,pepper:string):string {
 if(!HEX_KEY.test(pepper)||new Set(pepper.toLowerCase()).size<10)throw new Error('Reset lookup pepper must be a high-entropy 32-byte hex secret');
 return createHmac('sha256',Buffer.from(pepper,'hex')).update(normalizeResetEmail(email),'utf8').digest('hex');
}
export type ResetDeliveryEnvironment=Record<string,string|undefined>;
export function checkResetDelivery(env:ResetDeliveryEnvironment):{ok:boolean;errors:string[];relayUrl?:string;publicOrigin?:string} {
 const errors:string[]=[];
 const raw=env.PASSWORD_RESET_RELAY_URL||'';
 let relayUrl:string|undefined;
 let publicOrigin:string|undefined;
 try {
  const url=new URL(raw);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.port||
   !host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
   /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)||host==='[::1]')throw Error('relay');
  relayUrl=url.href;
 }catch{errors.push('RESET_RELAY_URL_INVALID')}
 try{
  const origin=new URL(env.PASSWORD_RESET_PUBLIC_ORIGIN||'');
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.port||
   !origin.hostname.includes('.')||origin.hostname==='localhost')throw Error('origin');
  publicOrigin=origin.origin;
 }catch{errors.push('RESET_PUBLIC_ORIGIN_INVALID')}
 const token=env.PASSWORD_RESET_RELAY_TOKEN||'';
 if(token.length<32||token.length>512||/\s/.test(token)||/replace|placeholder|change[_-]?me/i.test(token))errors.push('RESET_RELAY_TOKEN_INVALID');
 if(!HEX_KEY.test(env.PASSWORD_RESET_LOOKUP_PEPPER||'')||new Set((env.PASSWORD_RESET_LOOKUP_PEPPER||'').toLowerCase()).size<10)errors.push('RESET_LOOKUP_PEPPER_INVALID');
 if(publicOrigin && !(env.WEB_ORIGIN||'').split(',').map(x=>x.trim()).includes(publicOrigin))errors.push('RESET_PUBLIC_ORIGIN_NOT_ALLOWLISTED');
 return {ok:errors.length===0,errors,relayUrl,publicOrigin};
}
