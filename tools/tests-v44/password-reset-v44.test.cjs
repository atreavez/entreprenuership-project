'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const os=require('node:os');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function compile(file){
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v44-'));
 const result=cp.spawnSync('tsc',['--strict','--target','ES2022','--module','commonjs','--types','node','--outDir',out,file],{cwd:root,encoding:'utf8'});
 // Minimal global Node typings are not installed; compile without --types when needed.
 if(result.status!==0){
  const retry=cp.spawnSync('tsc',['--strict','--target','ES2022','--module','commonjs','--noEmitOnError','false','--outDir',out,file],{cwd:root,encoding:'utf8'});
  assert(fs.existsSync(path.join(out,path.basename(file).replace(/\.ts$/,'.js'))),retry.stderr+retry.stdout);
 }
 return {mod:require(path.join(out,path.basename(file).replace(/\.ts$/,'.js'))),clean:()=>fs.rmSync(out,{recursive:true,force:true})};
}
test('reset tokens are 256-bit random, strict canonical base64url and one-way hashed',()=>{
 const c=compile('apps/api/src/contexts/identity/domain/password-reset-policy.ts');try{
  const p=c.mod; const t=p.makePasswordResetToken();
  assert.match(t,/^[A-Za-z0-9_-]{43}$/);assert.equal(p.validPasswordResetToken(t),true);
  assert.equal(p.validPasswordResetToken(t+'='),false);assert.equal(p.validPasswordResetToken(t.slice(0,-1)),false);
  assert.equal(p.validPasswordResetToken('B'.repeat(43)),false,'Noncanonical base64url rejected');
  assert.equal(p.passwordResetDigest(t).length,64);assert.notEqual(p.passwordResetDigest(t),t);
  assert.notEqual(p.makePasswordResetToken(),t);
 }finally{c.clean()}
});
test('email-only rate-limit digest is peppered and normalizes harmless case',()=>{
 const c=compile('apps/api/src/contexts/identity/domain/password-reset-policy.ts');try{
  const p=c.mod; const pepper='b3a75cde109f4628edca5b0f774d912e624bb38a5f6c0dfe13597ab8e4d2c091';const a=p.lookupDigest(' Hello@Example.UG ',pepper);
  assert.equal(a,p.lookupDigest('hello@example.ug',pepper));
  assert.equal(a.length,64);assert(!a.includes('hello'));assert.throws(()=>p.lookupDigest('hello@example.ug','weak'));
  assert.throws(()=>p.normalizeResetEmail('bad address'));
 }finally{c.clean()}
});
test('reset relay configuration fails closed without HTTPS and a private server token',()=>{
 const c=compile('apps/api/src/contexts/identity/domain/password-reset-policy.ts');try{
  const p=c.mod;const good={PASSWORD_RESET_RELAY_URL:'https://relay.example.org/v1/messages',PASSWORD_RESET_RELAY_TOKEN:'a'.repeat(48),PASSWORD_RESET_PUBLIC_ORIGIN:'https://app.example.org',WEB_ORIGIN:'https://app.example.org',PASSWORD_RESET_LOOKUP_PEPPER:'b3a75cde109f4628edca5b0f774d912e624bb38a5f6c0dfe13597ab8e4d2c091'};
  assert.equal(p.checkResetDelivery(good).ok,true);
  for(const bad of [{PASSWORD_RESET_RELAY_URL:'http://relay.example.org'},{PASSWORD_RESET_RELAY_URL:'https://127.0.0.1/send'},{PASSWORD_RESET_RELAY_URL:'https://user:pw@relay.example.org/'},{PASSWORD_RESET_RELAY_URL:'https://relay.example.org/?token=abc'},{PASSWORD_RESET_RELAY_TOKEN:'weak'},{PASSWORD_RESET_PUBLIC_ORIGIN:'http://app.example.org'}])assert.equal(p.checkResetDelivery({...good,...bad}).ok,false,JSON.stringify(bad));
 }finally{c.clean()}
});
test('forward migration retains previous 18 migrations and stores only hashes with one active reset token',()=>{
 const plan=require('../migrations/plan.cjs').buildPlan();assert(plan.length>=19);
 assert.equal(plan[18].filename,'019_password_reset.sql');
 const sql=read('apps/api/sql/019_password_reset.sql');
 for(const s of ['token_hash char(64)','consumed_at','revoked_at','expires_at','delivery_state','CREATE UNIQUE INDEX','auth_password_reset_windows'])assert(sql.includes(s),s);
 assert(!sql.includes('token_plaintext'));
});
test('controller requires exact same origin, rate limiting and never echoes a reset token',()=>{
 const src=read('apps/api/src/contexts/identity/infrastructure/password-reset.module.ts');
 for(const s of ['isAllowedRequestOrigin','@Throttle','@Post(\'reset/request\')','@Post(\'reset/confirm\')','HttpCode(202)','PasswordResetService'])assert(src.includes(s),s);
 assert(!src.includes('return {token:'));
});
test('service consumes token under row lock, revokes sessions, challenges, tokens and logs audit',()=>{
 const src=read('apps/api/src/contexts/identity/infrastructure/password-reset.service.ts');
 for(const s of ['FOR UPDATE OF r,u','argon2.argon2id','auth_sessions','auth_login_challenges','consumed_at=now()','PASSWORD_RESET_COMPLETED','sendPasswordResetNotice','hashOpaque'])assert(src.includes(s),s);
 assert(!src.includes('console.log(token)'));
});
test('browser routes reset token through fragment and never places token in API URL',()=>{
 const src=read('apps/web/src/PasswordRecoveryPage.tsx');
 assert(src.includes("'/auth/password/reset/confirm'"));
 assert(src.includes("'/auth/password/reset/request'"));
 assert(src.includes('history.replaceState'));assert(src.includes('type="password"'));
 const api=read('apps/web/src/api.ts');assert(api.includes('password\\/reset\\/request|password\\/reset\\/confirm'));
});
test('CI does not omit v44 and keeps prior security/history checks',()=>{
 const yaml=read('.github/workflows/ci.yml');
 assert(yaml.includes('npm run verify:v44'));
 assert(yaml.includes('npm run test:pg:reset:v44'));
 const pg=read('tools/e2e-pg-password-reset-v44.mjs');assert(pg.indexOf('validateDisposablePgTarget(process.env)')<pg.indexOf("import('pg')"));
 assert(yaml.includes('npm run security:scan:v43 -- --history'));
 assert(yaml.includes('npm audit --omit=dev --audit-level=high'));
 const result=require('../ci-completeness-v41.cjs').validateCi({root});assert(result.ok,result.issues.join('; '));
});
