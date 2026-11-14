/** Tests session rotation and MFA against a LIVE disposable localhost PostgreSQL database. */
import {randomBytes, createHmac} from 'node:crypto';import assert from 'node:assert/strict';
import {assertSafeE2eTarget} from './e2e-safety.mjs';
const base=await assertSafeE2eTarget(process.env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000');const key=randomBytes(5).toString('hex');const email=`identity-${key}@test.invalid`;const pwd='IdentityTest-'+randomBytes(12).toString('hex');
let refreshCookie='';
async function req(path,body,auth='',expected=201,useCookie=true){const headers={};if(body!==undefined){headers['Content-Type']='application/json';headers.Origin=(process.env.WEB_ORIGIN||'http://localhost:5173').split(',')[0].trim();}if(auth)headers.Authorization='Bearer '+auth;if(refreshCookie&&useCookie)headers.Cookie=refreshCookie;
 const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
 const setCookie=res.headers.get('set-cookie');if(setCookie&&setCookie.startsWith('assettrust_refresh='))refreshCookie=setCookie.split(';')[0];
 let data={};try{data=await res.json()}catch{}assert.equal(res.status,expected,`${path}: ${JSON.stringify(data)}`);return data;
}
let checks=0;function ok(s){console.log('✓ '+s);checks++}
const r=await req('/auth/register',{fullName:'E2E Identity Only',organization:'Disposable Tests '+key,email,password:pwd});assert.ok(r.accessToken);assert.equal(r.refreshToken,undefined);assert.ok(refreshCookie);ok('Account registration creates bearer and HttpOnly session cookie');
const firstCookie=refreshCookie;const auth=r.accessToken;
await req('/auth/me',undefined,auth,200);ok('Access token authorizes authenticated principal');
const rotated=await req('/auth/refresh',{},'',201);assert.ok(rotated.accessToken);assert.notEqual(refreshCookie,firstCookie);ok('Refresh cookie rotates and yields new short-lived access token');
const nextCookie=refreshCookie;refreshCookie=firstCookie;await req('/auth/refresh',{},'',401);ok('Replayed old cookie rejected');
refreshCookie=nextCookie;await req('/auth/refresh',{},'',401);ok('Replay revokes that session');
const login=await req('/auth/login',{email,password:pwd});const me=await req('/auth/me',undefined,login.accessToken,200);assert.equal(me.email,email);ok('Password sign-in after revoked session');
const {secret}=await req('/auth/mfa/enroll',{currentPassword:pwd},login.accessToken);assert.match(secret,/^[A-Z2-7]+$/);ok('MFA enrollment returns setup key only after password');
function decode32(s){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,v=0,a=[];for(const c of s){v=(v<<5)|abc.indexOf(c);bits+=5;if(bits>=8){a.push((v>>>(bits-=8))&255)}}return Buffer.from(a)}
function code(){const count=Buffer.alloc(8);count.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',decode32(secret)).update(count).digest();const offset=h.at(-1)&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1e6).padStart(6,'0')}
const confirm=await req('/auth/mfa/confirm',{code:code()},login.accessToken);assert.equal(confirm.recoveryCodes.length,10);ok('Confirmed TOTP and issued one-time recovery codes');
const second=await req('/auth/login',{email,password:pwd});assert.equal(second.mfaRequired,true);assert.equal(second.accessToken,undefined);ok('Correct password alone cannot issue session after MFA');
await req('/auth/mfa/complete',{challengeToken:second.challengeToken,code:'000000'},'',401);ok('Incorrect MFA code blocked');
const completed=await req('/auth/mfa/complete',{challengeToken:second.challengeToken,backupCode:confirm.recoveryCodes[0]});assert.ok(completed.accessToken);ok('One-time recovery code permits sign-in');
const reuse=await req('/auth/login',{email,password:pwd});await req('/auth/mfa/complete',{challengeToken:reuse.challengeToken,backupCode:confirm.recoveryCodes[0]},'',401);ok('Used backup code cannot be reused');
// v0.18 regression: a recovery code consumed during sign-in must not authorize MFA removal.
await req('/auth/mfa/disable',{currentPassword:pwd,backupCode:confirm.recoveryCodes[0]},completed.accessToken,401);
ok('Consumed login recovery code cannot disable MFA');
const beforeDisable=await req('/auth/mfa/status',undefined,completed.accessToken,200);
assert.equal(beforeDisable.enabled,true);
ok('Failed MFA removal preserves account MFA protection');
const disabled=await req('/auth/mfa/disable',{currentPassword:pwd,backupCode:confirm.recoveryCodes[1]},completed.accessToken);
assert.equal(disabled.enabled,false);
ok('Unused recovery code permits authenticated MFA removal with current password');
const listed=await req('/auth/sessions',undefined,completed.accessToken,200);assert.ok(listed.sessions.length>=2);ok('Sessions listed per authenticated user');
await req('/auth/logout-all',{},completed.accessToken);await req('/auth/me',undefined,completed.accessToken,401);ok('Logout all instantly invalidates active access token');
console.log(`PASS ${checks} identity/security HTTP checks, disposable user ${email}`);
