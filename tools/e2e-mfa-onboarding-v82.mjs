/** Local disposable E2E helper: enroll a synthetic ORG_ADMIN with real TOTP.
 * Caller must first validate owned loopback API + disposable DB. Never print,
 * persist, or include setup secrets, codes, passwords, or recovery codes in evidence.
 */
import {createHmac} from 'node:crypto';

function decodeBase32(value){
 if(typeof value!=='string'||!/^[A-Z2-7]{16,128}$/.test(value))throw Error('INVALID_SYNTHETIC_MFA_SECRET');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let pending=0,bits=0;const bytes=[];
 for(const letter of value){pending=(pending<<5)|alphabet.indexOf(letter);bits+=5;
  if(bits>=8){bits-=8;bytes.push((pending>>>bits)&255);pending&=(1<<bits)-1;}}
 if(bytes.length<10||bits>0&&pending!==0)throw Error('INVALID_SYNTHETIC_MFA_SECRET');
 return Buffer.from(bytes);
}
export function syntheticTotp(base32,timeMs=Date.now()){
 if(!Number.isSafeInteger(timeMs)||timeMs<0)throw Error('INVALID_SYNTHETIC_CLOCK');
 const key=decodeBase32(base32),counter=BigInt(Math.floor(timeMs/30000));
 const msg=Buffer.alloc(8);msg.writeBigUInt64BE(counter);
 const digest=createHmac('sha1',key).update(msg).digest();const i=digest[19]&15;
 const number=(digest.readUInt32BE(i)&0x7fffffff)%1000000;
 return String(number).padStart(6,'0');
}
export async function enrollSyntheticAdminMfa({token,password,send,clock=Date.now}){
 if(typeof token!=='string'||!token||typeof password!=='string'||!password||typeof send!=='function')throw Error('INVALID_SYNTHETIC_MFA_INPUT');
 // All server replies are held in-memory only. The caller records no raw result.
 const enrollment=await send('/auth/mfa/enroll',token,{currentPassword:password});
 const code=syntheticTotp(enrollment?.secret,clock());
 const confirmed=await send('/auth/mfa/confirm',token,{code});
 if(confirmed?.enabled!==true||!Array.isArray(confirmed?.recoveryCodes)||confirmed.recoveryCodes.length!==10)
  throw Error('SYNTHETIC_ADMIN_MFA_NOT_CONFIRMED');
 return true;
}
