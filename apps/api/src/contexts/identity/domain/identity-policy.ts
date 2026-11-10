/** Pure identity domain: no NestJS, PostgreSQL, React or environment dependencies. */
import { createHash, createHmac, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64=/^[A-Za-z0-9_-]{43}$/;
export const ACCESS_TTL_SECONDS=15*60;
export const REFRESH_TTL_MS=7*24*60*60*1000;
export const CHALLENGE_TTL_MS=5*60*1000;
export function makeRefreshToken(sessionId:string){if(!UUID.test(sessionId))throw new Error('Invalid session ID');return `${sessionId}.${randomBytes(32).toString('base64url')}`;}
export function parseRefreshToken(input:unknown):{sessionId:string;secret:string}{
 if(typeof input!=='string')throw new Error('Invalid session token');const parts=input.split('.');
 if(parts.length!==2||!UUID.test(parts[0])||!B64.test(parts[1]))throw new Error('Invalid session token');
 return {sessionId:parts[0],secret:parts[1]};
}
export const hashOpaque=(raw:string)=>createHash('sha256').update(raw).digest('hex');
export function refreshHashEquals(expected:string,presented:string){const actual=hashOpaque(presented);if(!/^[a-f0-9]{64}$/i.test(expected))return false;return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));}
export function canRotateRefresh(session:{expiresAt:Date;revokedAt:Date|null},now=Date.now()){return session.expiresAt.getTime()>now && !session.revokedAt;}
export function validateNewPassword(input:unknown):asserts input is string{
 if(typeof input!=='string'||input.length<12||input.length>128||!/[a-zA-Z]/.test(input)||!/[0-9]/.test(input)||input.trim()!==input)throw new Error('Use a 12–128 character password with letters and numbers; no outer spaces');
}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(input:Buffer){let bits=0,bucket=0,out='';for(const n of input){bucket=(bucket<<8)|n;bits+=8;while(bits>=5){out+=B32[(bucket>>>(bits-=5))&31];}}if(bits>0)out+=B32[(bucket<<(5-bits))&31];return out;}
export function decodeBase32(input:string){if(!/^[A-Z2-7]+$/.test(input))throw new Error('Invalid Base32');let bits=0,bucket=0;const out:number[]=[];for(const c of input){bucket=(bucket<<5)|B32.indexOf(c);bits+=5;if(bits>=8){out.push((bucket>>>(bits-=8))&255);}}return Buffer.from(out);}
export const createMfaSecret=()=>encodeBase32(randomBytes(20));
export function totpAt(secret:Buffer,nowMs:number,digits=6,period=30){const step=Math.floor(nowMs/(period*1000));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const digest=createHmac('sha1',secret).update(counter).digest();const offset=digest[digest.length-1]&15;const h=(digest.readUInt32BE(offset)&0x7fffffff)%(10**digits);return String(h).padStart(digits,'0');}
/** Returns the accepted counter step or null; prevents reuse when lastUsedStep >= step. */
export function verifyTotp(secret:Buffer,code:unknown,nowMs:number,lastUsedStep=-1,digits=6){if(typeof code!=='string'||!new RegExp(`^[0-9]{${digits}}$`).test(code))return null;
 const step=Math.floor(nowMs/30000);
 for(let delta=-1;delta<=1;delta++){const candidate=step+delta;if(candidate<=lastUsedStep||candidate<0)continue;const expected=totpAt(secret,candidate*30000,digits);if(timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return candidate;}return null;}
export function sealSecret(clear:string,key:Buffer){if(key.length!==32)throw new Error('MFA key must be 32 bytes');const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(clear,'utf8'),cipher.final()]);return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${data.toString('base64url')}`;}
export function openSecret(encrypted:string,key:Buffer){if(key.length!==32)throw new Error('MFA key must be 32 bytes');const [v,iv,tag,data,...extra]=encrypted.split(':');if(v!=='v1'||!iv||!tag||!data||extra.length)throw new Error('Invalid encrypted secret');const dec=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));dec.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([dec.update(Buffer.from(data,'base64url')),dec.final()]).toString('utf8');}
export const newSessionId=()=>randomUUID();

/** Opaque recovery codes use exactly ten random bytes encoded as base64url. */
export function isValidRecoveryCode(code:unknown):code is string{
 return typeof code==='string' && /^[A-Za-z0-9_-]{14}$/.test(code);
}
