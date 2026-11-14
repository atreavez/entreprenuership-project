'use strict';
/** v0.84 tests execute the REAL TS AuthenticationService with a controlled
 * transactional adapter. No fake PostgreSQL or production-readiness claims. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const ROOT=path.resolve(__dirname,'../..');
const filename=path.join(ROOT,'apps/api/src/auth.ts');
const source=fs.readFileSync(filename,'utf8');
class UnauthorizedException extends Error{};
class ForbiddenException extends Error{};
class BadRequestException extends Error{};
const dec=()=>()=>{};
const deps={
 '@nestjs/common':{UnauthorizedException,ForbiddenException,BadRequestException,ConflictException:class extends Error{},ServiceUnavailableException:class extends Error{},Controller:dec,Body:dec,Delete:dec,Get:dec,Injectable:dec,Module:dec,Post:dec,Req:dec,Res:dec,UseGuards:dec},
 '@nestjs/jwt':{JwtModule:{register:()=>({})}},'@nestjs/throttler':{Throttle:dec},
 'argon2':{argon2id:2,verify:async(hash,pw)=>hash==='password-old'&&pw==='correct-password',hash:async()=> 'password-new'},
 './common':{uid:()=> 'fixture-uuid',text:v=>v,hash:x=>x},'./database':{},'./audit':{},
 './contexts/identity/application/session-usecases':{},'./contexts/identity/infrastructure/pg-session.repository':{},
 './contexts/identity/infrastructure/login-abuse.service':{},
 './contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true},
 './contexts/identity/domain/coadmin-policy':{requiresAdminMfa:(role,flag)=>role==='ORG_ADMIN'||flag===true,isCoAdminEnrollmentRoute:()=>false,hasAdminSessionMfaProof:()=>false},
 './contexts/identity/domain/identity-policy':{CHALLENGE_TTL_MS:300000,validateNewPassword:()=>{},hashOpaque:s=>'hash-'+s,verifyTotp:(_secret,code)=>code==='123456'?2000:null,decodeBase32:()=>Buffer.alloc(20),openSecret:()=> 'BASE32_SECRET',isValidRecoveryCode:()=>false,createMfaSecret:()=> 'BASE32_SECRET',sealSecret:()=> 'encrypted'}
};
const transpiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true}}).outputText;
function fixture({role='CLIENT',active=true,hash='password-old',session=true,credential=true,pending=false,fail=null}={}){
 const traces=[];let inTx=false;let writes=0;
 const mod={exports:{}};
 vm.runInNewContext(transpiled,{module:mod,exports:mod.exports,require:n=>Object.hasOwn(deps,n)?deps[n]:require(n),Buffer,Date,console,process:{env:{MFA_ENCRYPTION_KEY:'a'.repeat(64)}}},{filename,timeout:5000});
 const row=(data)=>({rows:[data],rowCount:1});
 const db={
  async query(){throw Error('CREDENTIAL_PREFLIGHT_OUTSIDE_TRANSACTION')},
  async transaction(fn){assert(!inTx);inTx=true;traces.push({kind:'BEGIN'});
   try{const result=await fn({query:async(sql,params)=>{
    traces.push({kind:'SQL',sql,params});
    if(fail&&sql.includes(fail))throw Error('SIMULATED_DATABASE_FAILURE');
    if(sql.includes('SELECT admin_mfa_required,role FROM users'))return active?row({admin_mfa_required:false,role}):{rows:[]};
    if(sql.includes('SELECT password_hash FROM users'))return row({password_hash:hash});
    if(sql.includes('SELECT id FROM users WHERE'))return active?row({id:'user-1'}):{rows:[]};
    if(sql.includes('SELECT secret_ciphertext,enabled,last_used_step'))return credential?row({secret_ciphertext:'ciphertext',enabled:!pending,last_used_step:-1}):{rows:[]};
    if(sql.includes('SELECT id FROM auth_sessions'))return session?row({id:'session-1'}):{rows:[]};
    if(sql.includes('UPDATE auth_sessions SET mfa_verified_at=now()'))return session?row({id:'session-1'}):{rows:[],rowCount:0};
    return {rows:[],rowCount:1};
   }});traces.push({kind:'COMMIT'});return result;}
   catch(e){traces.push({kind:'ROLLBACK'});throw e;}
   finally{inTx=false;}
  }
 };
 const auth=new mod.exports.AuthenticationService(db,{}, {write:async()=>{assert(inTx);writes++;traces.push({kind:'AUDIT'});}});
 const user={id:'user-1',organizationId:'org-1',role,email:'owner@example.test'};
 return {traces,auth,user,writes:()=>writes, step:()=>auth.stepUpMfa(user,'session-1','123456'),disable:()=>auth.disableMfa(user,'session-1',{currentPassword:'correct-password',code:'123456'}),confirm:()=>auth.confirmMfa(user,'session-1','123456')};
}
const sqlItems=x=>x.traces.filter(c=>c.kind==='SQL');
const find=(x,needle)=>x.traces.findIndex(c=>c.sql?.includes(needle));
const committed=x=>x.traces.some(c=>c.kind==='COMMIT');
const audited=x=>x.traces.some(c=>c.kind==='AUDIT');

test('step-up locks current active account before touching TOTP credentials',async()=>{const x=fixture();await x.step();assert(find(x,'SELECT id FROM users')>=0);assert(find(x,'SELECT id FROM users')<find(x,'SELECT secret_ciphertext'));assert.match(sqlItems(x)[0].sql,/suspended_at IS NULL FOR SHARE/);});
test('step-up explicitly scopes current account to organization',async()=>{const x=fixture();await x.step();assert.deepEqual(Array.from(sqlItems(x)[0].params),['user-1','org-1']);});
test('step-up denies suspended accounts before fetching authenticator',async()=>{const x=fixture({active:false});await assert.rejects(()=>x.step(),UnauthorizedException);assert.equal(find(x,'SELECT secret_ciphertext'),-1);assert(!audited(x));});
test('step-up rejects a missing or disabled MFA credential',async()=>{const x=fixture({credential:false});await assert.rejects(()=>x.step(),ForbiddenException);assert.equal(find(x,'UPDATE auth_sessions'),-1);});
test('step-up rejects sessions revoked or expired since HTTP guard',async()=>{const x=fixture({session:false});await assert.rejects(()=>x.step(),UnauthorizedException);assert(!committed(x));assert(!audited(x));});
test('step-up verifies actual session organization, revocation and both expiries',async()=>{const x=fixture();await x.step();const item=sqlItems(x).find(c=>c.sql.includes('UPDATE auth_sessions SET mfa_verified_at=now()'));assert(item);for(const token of ['organization_id=$3','revoked_at IS NULL','expires_at>now()','absolute_expires_at>now()','RETURNING id'])assert(item.sql.includes(token),token);assert.deepEqual(Array.from(item.params),['session-1','user-1','org-1']);});
test('step-up does not consume TOTP before confirming active session',async()=>{const x=fixture();await x.step();assert(find(x,'UPDATE auth_sessions SET mfa_verified_at=now()')<find(x,'UPDATE auth_mfa_credentials SET last_used_step'));});
test('step-up rollback preserves TOTP if session proof update fails',async()=>{const x=fixture({fail:'UPDATE auth_sessions SET mfa_verified_at=now()'});await assert.rejects(()=>x.step(),/SIMULATED_DATABASE_FAILURE/);assert(!committed(x));assert.equal(find(x,'UPDATE auth_mfa_credentials SET last_used_step'),-1);});
test('step-up audit failure rolls back proof and replay-counter update',async()=>{const x=fixture();x.auth.audit.write=async()=>{throw Error('AUDIT_FAILED')};await assert.rejects(()=>x.step(),/AUDIT_FAILED/);assert(!committed(x));});
test('valid MFA step-up commits with exactly one audit event',async()=>{const x=fixture();const result=await x.step();assert.equal(result.verifiedForMinutes,15);assert(committed(x));assert.equal(x.writes(),1);});

test('MFA disable checks account role under a lock before checking password',async()=>{const x=fixture();await x.disable();const lock=find(x,'SELECT admin_mfa_required,role FROM users'),pw=find(x,'SELECT password_hash FROM users');assert(lock>=0&&lock<pw);assert.match(x.traces[lock].sql,/suspended_at IS NULL FOR SHARE/);});
test('MFA disable checks password inside same transaction, not against stale preflight',async()=>{const x=fixture();await x.disable();assert.deepEqual(x.traces.slice(0,2).map(c=>c.kind),['BEGIN','SQL']);assert(find(x,'SELECT password_hash FROM users')<find(x,'SELECT secret_ciphertext'));});
test('MFA disable rejects password rotated before account lock',async()=>{const x=fixture({hash:'password-new'});await assert.rejects(()=>x.disable(),UnauthorizedException);assert.equal(find(x,'SELECT secret_ciphertext'),-1);assert(!committed(x));});
test('MFA disable rejects suspended user before checking password or authenticator',async()=>{const x=fixture({active:false});await assert.rejects(()=>x.disable(),UnauthorizedException);assert.equal(find(x,'SELECT password_hash'),-1);});
test('MFA disable rejects mandatory administrator before touching credentials',async()=>{const x=fixture({role:'ORG_ADMIN'});await assert.rejects(()=>x.disable(),ForbiddenException);assert.equal(find(x,'SELECT password_hash'),-1);});
test('MFA disable requires a real current session before deleting credential',async()=>{const x=fixture({session:false});await assert.rejects(()=>x.disable(),UnauthorizedException);assert.equal(find(x,'DELETE FROM auth_mfa_credentials'),-1);assert(!committed(x));});
test('MFA disable locks active session and checks organization and expiry',async()=>{const x=fixture();await x.disable();const q=sqlItems(x).find(c=>c.sql.includes('SELECT id FROM auth_sessions'));assert(q);for(const token of ['organization_id=$3','revoked_at IS NULL','expires_at>now()','absolute_expires_at>now()','FOR UPDATE'])assert(q.sql.includes(token));assert.deepEqual(Array.from(q.params),['session-1','user-1','org-1']);});
test('MFA disable orders session lock before MFA credential deletion',async()=>{const x=fixture();await x.disable();assert(find(x,'SELECT id FROM auth_sessions')<find(x,'DELETE FROM auth_mfa_credentials'));});
test('MFA disable revokes MFA proof for ALL sessions before commit',async()=>{const x=fixture();await x.disable();const i=find(x,'UPDATE auth_sessions SET mfa_verified_at=NULL');assert(i>=0);assert.match(x.traces[i].sql,/WHERE user_id=\$1/);assert(i<x.traces.findIndex(c=>c.kind==='COMMIT'));});
test('MFA disable fails closed if session query fails',async()=>{const x=fixture({fail:'SELECT id FROM auth_sessions'});await assert.rejects(()=>x.disable(),/SIMULATED_DATABASE_FAILURE/);assert(!committed(x));assert.equal(find(x,'DELETE FROM auth_mfa_credentials'),-1);});
test('MFA disable commits only after audit and all session cleanup writes',async()=>{const x=fixture();await x.disable();assert(audited(x));assert(x.traces.findIndex(c=>c.kind==='AUDIT')<x.traces.findIndex(c=>c.kind==='COMMIT'));assert(find(x,'UPDATE auth_sessions SET revoked_at=now()')>find(x,'UPDATE auth_sessions SET mfa_verified_at=NULL'));});

test('MFA confirmation rechecks owning session before committing enrollment',async()=>{const x=fixture({pending:true});await x.confirm();assert(find(x,'UPDATE auth_sessions SET mfa_verified_at=now()')>find(x,'UPDATE auth_mfa_credentials SET enabled=true'));assert(committed(x));});
test('MFA confirmation rejects revoked session and rolls back enrollment',async()=>{const x=fixture({session:false,pending:true});await assert.rejects(()=>x.confirm(),UnauthorizedException);assert(!committed(x));assert(!audited(x));});
test('MFA confirmation session proof requires same organization, unrevoked and unexpired',async()=>{const x=fixture({pending:true});await x.confirm();const q=sqlItems(x).find(c=>c.sql.includes('UPDATE auth_sessions SET mfa_verified_at=now()'));for(const t of ['organization_id=$3','revoked_at IS NULL','expires_at>now()','absolute_expires_at>now()','RETURNING id'])assert(q.sql.includes(t));});
test('MFA confirmation missing user stops before touching credential',async()=>{const x=fixture({active:false});await assert.rejects(()=>x.confirm(),UnauthorizedException);assert.equal(find(x,'SELECT secret_ciphertext'),-1);});

test('the new milestone changes no SQL migrations',()=>{const sql=fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(f=>/^\d+_.*\.sql$/.test(f));assert.equal(sql.length,27);});
test('CI includes the v0.84 offline suite before the live integration gates',()=>{const w=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8'),j=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));assert.match(w,/npm run verify:v84/);assert.match(j.scripts['verify:v84'],/tests-v84/);});
test('all three sensitive MFA mutations maintain one transaction each',()=>{for(const name of ['stepUpMfa','confirmMfa','disableMfa']){const begin=source.indexOf('async '+name+'('),end=source.indexOf('\n async ',begin+7);const body=source.slice(begin,end<0?undefined:end);assert.match(body,/this\.db\.transaction\(async tx/);assert.doesNotMatch(body,/this\.db\.query\(/);}});
