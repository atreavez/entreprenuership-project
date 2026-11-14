/** Pure identity policy: never use raw emails or IPs as storage keys. */
import {createHmac} from 'node:crypto';
export const LOGIN_ABUSE_MAX_ATTEMPTS = 10;
export const LOGIN_ABUSE_WINDOW_MINUTES = 15;
export function loginIdentityKey(raw:unknown,pepper:string):string {
 if(typeof raw!=='string')throw new Error('Invalid login identity');
 const email=raw.trim().toLowerCase();
 if(email.length<5||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n\0]/.test(email))throw new Error('Invalid login identity');
 if(!/^[0-9a-f]{64}$/i.test(pepper)||new Set(pepper.toLowerCase()).size<10)throw new Error('LOGIN_ABUSE_PEPPER must be a unique high-entropy 32-byte secret');
 return createHmac('sha256',Buffer.from(pepper,'hex')).update('assettrust-login:v1:'+email,'utf8').digest('hex');
}
export function loginBlocked(row:{blocked_until?:string|Date|null}|null,now:Date):boolean {
 if(!row?.blocked_until)return false;
 const value=new Date(row.blocked_until).getTime();
 return Number.isFinite(value)&&value>now.getTime();
}
