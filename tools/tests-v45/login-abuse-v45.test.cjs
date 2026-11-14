'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const ROOT=path.resolve(__dirname,'../..');
const PEPPER='f4b8a203c7d95e61a0fe39db784106cf291c0bad63e572804bfc7d158e92c03a';
function load(relative,imports={},env={LOGIN_ABUSE_PEPPER:PEPPER}){
 const filename=path.join(ROOT,relative);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true}}).outputText;
 const box={exports:{}};vm.runInNewContext(code,{module:box,exports:box.exports,require:n=>Object.hasOwn(imports,n)?imports[n]:require(n),process:{env},Date,Buffer,URL,console},{filename,timeout:5000});return box.exports;
}
const policy=load('apps/api/src/contexts/identity/domain/login-abuse-policy.ts');
class HttpException extends Error{constructor(msg,status){super(msg);this.status=status}}class ServiceUnavailableException extends Error{}
const {LoginAbuseService}=load('apps/api/src/contexts/identity/infrastructure/login-abuse.service.ts',{
 '@nestjs/common':{Injectable:()=>c=>c,HttpException,HttpStatus:{TOO_MANY_REQUESTS:429},ServiceUnavailableException},
 '../../../database':{},'../domain/login-abuse-policy':policy});
function fixture(){const calls=[],counters=new Map();return {
 calls,counters,
 service:new LoginAbuseService({query:async(sql,params)=>{calls.push({sql,params});
  if(sql.includes('INSERT INTO auth_login_abuse_windows')){const n=Math.min(11,(counters.get(params[0])||0)+1);counters.set(params[0],n);return {rows:[{attempt_count:n,blocked_until:n===11?new Date(Date.now()+900000):null,checked_at:new Date()}]}}
  if(sql.startsWith('DELETE FROM auth_login_abuse_windows')){counters.delete(params[0]);return {rowCount:1}};throw Error('Unexpected query '+sql);
 }})};}
test('keyed digest normalizes email without disclosing address and rejects malformed keys/identities',()=>{
 const a=policy.loginIdentityKey(' USER@Example.ug ',PEPPER);assert.equal(a,policy.loginIdentityKey('user@example.UG',PEPPER));
 assert.match(a,/^[0-9a-f]{64}$/);assert(!a.includes('user'));assert.notEqual(a,policy.loginIdentityKey('other@example.ug',PEPPER));
 assert.throws(()=>policy.loginIdentityKey('user@example.ug','weak'));assert.throws(()=>policy.loginIdentityKey('bad-email',PEPPER));
});
test('blocked status uses supplied database time, not application clock',()=>{
 const r={blocked_until:new Date('2026-11-11T12:00:00Z')};
 assert.equal(policy.loginBlocked(r,new Date('2026-11-11T11:59:59Z')),true);
 assert.equal(policy.loginBlocked(r,new Date('2026-11-11T12:00:00Z')),false);
 assert.equal(policy.loginBlocked({blocked_until:null},new Date()),false);
});
test('first ten reservations allowed and 11th fails with HTTP 429',async()=>{
 const x=fixture();for(let i=0;i<10;i++)await x.service.reserveAttempt('missing@example.ug');
 await assert.rejects(()=>x.service.reserveAttempt('missing@example.ug'),err=>err.status===429);
 assert.equal(x.counters.size,1);assert.equal(x.calls.length,11);
 for(const c of x.calls){assert.match(c.params[0],/^[0-9a-f]{64}$/);assert(!JSON.stringify(c).includes('missing@example.ug'))}
});
test('only valid password proof clears keyed counter, and another identity is unaffected',async()=>{
 const x=fixture();await x.service.reserveAttempt('one@example.ug');await x.service.reserveAttempt('two@example.ug');
 await x.service.clearAfterPasswordProof('ONE@example.ug');assert.equal(x.counters.size,1);
 await x.service.clearAfterPasswordProof('two@example.ug');assert.equal(x.counters.size,0);
 const sql=x.calls[0].sql;assert.match(sql,/ON CONFLICT\(identity_hash\) DO UPDATE/);
 assert.match(sql,/blocked_until>now\(\)/);assert.match(sql,/interval '15 minutes'/);
});
test('database errors or missing pepper fail closed',async()=>{
 const db={query:async()=>{throw Error('DB unavailable')}};
 await assert.rejects(()=>new LoginAbuseService(db).reserveAttempt('x@example.ug'),/DB unavailable/);
 const source=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/identity/infrastructure/login-abuse.service.ts'),'utf8');
 assert.match(source,/LOGIN_ABUSE_PEPPER/);assert.match(source,/ServiceUnavailableException/);
});
// Exercise the real transpiled HTTP controller with controlled NestJS/auth adapters.
function controller({passwordValid=false,blocked=false,mfaValid=true}={}){
 const calls=[];class UnauthorizedException extends Error{}const dec=()=>()=>{};
 const common={UnauthorizedException,ForbiddenException:class extends Error{},BadRequestException:class extends Error{},ConflictException:class extends Error{},ServiceUnavailableException,
  Controller:dec,Body:dec,Delete:dec,Get:dec,Injectable:dec,Module:dec,Post:dec,Req:dec,Res:dec,UseGuards:dec};
 const auth=load('apps/api/src/auth.ts',{'@nestjs/common':common,'@nestjs/jwt':{JwtModule:{register:()=>({})}},'@nestjs/throttler':{Throttle:dec},
  'argon2':{},'./database':{},'./audit':{},'./common':{},'./contexts/identity/application/session-usecases':{},'./contexts/identity/infrastructure/pg-session.repository':{},
  './contexts/identity/domain/coadmin-policy':{},'./contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true},
  './contexts/identity/domain/identity-policy':{},'./contexts/identity/infrastructure/login-abuse.service':{LoginAbuseService:class{}}});
 const abuse={reserveAttempt:async()=>{calls.push('reserve');if(blocked)throw new HttpException('blocked',429)},clearAfterPasswordProof:async()=>calls.push('clear')};
 const cred={login:async()=>{calls.push('verify');if(!passwordValid)throw new UnauthorizedException('Incorrect credentials');return {mfaRequired:true,challengeToken:'test'}},completeMfa:async()=>{calls.push('mfa');if(!mfaValid)throw new UnauthorizedException('Invalid MFA challenge');return {user:{email:'x@example.ug'},refreshToken:'disposable-test',sessionId:'session-test',accessToken:'test-access'}}};
 return {instance:new auth.AuthController(cred,{},abuse),calls,req:{headers:{origin:'http://localhost:5173','user-agent':'test'}}};
}
test('actual login controller reserves attempt BEFORE verifying, clears only on valid password',async()=>{
 const yes=controller({passwordValid:true});const r=await yes.instance.login(yes.req,{}, {email:'x@example.ug',password:'valid'});
 assert.equal(r.mfaRequired,true);assert.deepEqual(yes.calls,['reserve','verify']);
 const no=controller();await assert.rejects(()=>no.instance.login(no.req,{}, {email:'x@example.ug',password:'invalid'}));
 assert.deepEqual(no.calls,['reserve','verify']);
});
test('MFA failure preserves the counter; successful MFA clears only after second factor',async()=>{
 const f=controller({passwordValid:true});const response={cookie:()=>{}};
 await f.instance.login(f.req,response,{email:'x@example.ug',password:'valid'});
 await f.instance.complete(f.req,response,{challengeToken:'dummy',code:'123456'});
 assert.deepEqual(f.calls,['reserve','verify','mfa','clear']);
 const bad=controller({passwordValid:true,mfaValid:false});await bad.instance.login(bad.req,response,{email:'x@example.ug',password:'valid'});
 await assert.rejects(()=>bad.instance.complete(bad.req,response,{challengeToken:'dummy',code:'wrong'}));
 assert.deepEqual(bad.calls,['reserve','verify','mfa']);
});
test('blocked login never reaches password verification',async()=>{
 const f=controller({blocked:true,passwordValid:true});await assert.rejects(()=>f.instance.login(f.req,{}, {email:'x@example.ug'}),err=>err.status===429);assert.deepEqual(f.calls,['reserve']);
});
test('new migration is append-only and stores no plaintext identifier',()=>{
 const plan=require('../migrations/plan.cjs').buildPlan();assert(plan.length>=20);assert.equal(plan[19].filename,'020_distributed_login_abuse.sql');assert.equal(plan[19].sha256,'ca52962c93afa64fdddedbb481992187053af85553272306a1542229536a83b1');
 const sql=fs.readFileSync(path.join(ROOT,'apps/api/sql/020_distributed_login_abuse.sql'),'utf8');
 for(const x of ['identity_hash char(64) PRIMARY KEY','attempt_count','blocked_until','last_attempt_at'])assert(sql.includes(x));
 assert(!/^\s*(email|ip_address|password|raw_token)\s+/mi.test(sql));
});
test('production startup rejects absent/reused HMAC secret, while valid distinct secret is accepted',()=>{
 const runtime=load('apps/api/src/contexts/platform/domain/runtime-config.ts');
 const base={NODE_ENV:'production',CLAMAV_SOCKET_PATH:'/run/clamav/clamd.ctl',JWT_SECRET:'abcdefghijklmnopqrstuvwxyzABCDEF0123456789@#',MFA_ENCRYPTION_KEY:'0123456789abcdef'.repeat(4),
  DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:'fedcba9876543210'.repeat(4)}),
  DATABASE_URL:'postgres://user:long-random-password@prod.db.example.org:5432/assettrust',WEB_ORIGIN:'https://app.example.org',LOGIN_ABUSE_PEPPER:PEPPER};
 assert(runtime.validateRuntimeConfig(base).ok);
 assert(runtime.validateRuntimeConfig({...base,LOGIN_ABUSE_PEPPER:''}).issues.some(i=>i.code==='LOGIN_ABUSE_KEY_INVALID'));
 assert(runtime.validateRuntimeConfig({...base,LOGIN_ABUSE_PEPPER:base.MFA_ENCRYPTION_KEY}).issues.some(i=>i.code==='LOGIN_ABUSE_KEY_REUSE'));
});
test('CI includes all version suites plus a guarded PostgreSQL contract',()=>{
 const yaml=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 assert(yaml.includes('npm run verify:v45'));assert(yaml.includes('npm run test:pg:login-abuse:v45'));
 const pg=fs.readFileSync(path.join(ROOT,'tools/e2e-pg-login-abuse-v45.mjs'),'utf8');assert(pg.indexOf('validateDisposablePgTarget(process.env)')<pg.indexOf("import('pg')"));
 const c=require('../ci-completeness-v41.cjs').validateCi({root:ROOT});assert(c.ok,c.issues.join('; '));
});
