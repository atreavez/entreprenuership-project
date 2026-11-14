'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=process.env.ASSETTRUST_V83_BASELINE_ROOT?path.resolve(process.env.ASSETTRUST_V83_BASELINE_ROOT):path.resolve(__dirname,'../..');
const filename=path.join(root,'apps/api/src/auth.ts');
const source=fs.readFileSync(filename,'utf8');
class UnauthorizedException extends Error{}class BadRequestException extends Error{}class ForbiddenException extends Error{}
const dec=()=>()=>{};
const deps={
 '@nestjs/common':{UnauthorizedException,BadRequestException,ForbiddenException,ServiceUnavailableException:class extends Error{},ConflictException:class extends Error{},Controller:dec,Body:dec,Delete:dec,Get:dec,Injectable:dec,Module:dec,Post:dec,Req:dec,Res:dec,UseGuards:dec},
 '@nestjs/jwt':{JwtModule:{register:()=>({})}},'@nestjs/throttler':{Throttle:dec},
 'argon2':{argon2id:2,hash:async()=> 'argon2-new',verify:async(hash,pw)=>hash==='argon2-old' && pw==='correct-old'},
 './common':{uid:()=> 'test-id',text:x=>x,hash:x=>x}, './database':{},'./audit':{},
 './contexts/identity/application/session-usecases':{}, './contexts/identity/infrastructure/pg-session.repository':{},
 './contexts/identity/infrastructure/login-abuse.service':{},
 './contexts/identity/domain/request-origin-policy':{isAllowedRequestOrigin:()=>true},
 './contexts/identity/domain/coadmin-policy':{requiresAdminMfa:(role,flag)=>role==='ORG_ADMIN'||flag===true,isCoAdminEnrollmentRoute:()=>false,hasAdminSessionMfaProof:()=>false},
 './contexts/identity/domain/identity-policy':{CHALLENGE_TTL_MS:300000,validateNewPassword:()=>{},hashOpaque:s=>'digest-'+s,verifyTotp:()=>1234,decodeBase32:()=>Buffer.alloc(20),openSecret:()=> 'TEST_BASE32',isValidRecoveryCode:()=>false,createMfaSecret:()=> 'TEST_BASE32',sealSecret:()=> 'encrypted'}
};
const compiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true}}).outputText;
function build({mfa=false,currentMfa=mfa,lockedHash='argon2-old',lockedSuspended=false,userRole='CLIENT',noLockedRow=false,dbFailure=null}={}){
 const calls=[];let inTx=false;let minted=0;const ctx={env:{MFA_ENCRYPTION_KEY:'a'.repeat(64)}};
 const exported={};const mod={exports:exported};
 vm.runInNewContext(compiled,{module:mod,exports:exported,require:n=>Object.hasOwn(deps,n)?deps[n]:require(n),Buffer,Date,console,process:ctx},{filename,timeout:5000});
 const db={
   async query(sql,params){calls.push({phase:'outside',sql,params});if(sql.includes('FROM users u LEFT JOIN auth_mfa_credentials'))return {rows:[{id:'user-1',organization_id:'org-1',email:'owner@example.ug',full_name:'Owner',role:userRole,password_hash:'argon2-old',mfa_enabled:mfa,admin_mfa_required:userRole==='ORG_ADMIN',admin_mfa_enrolled:mfa}]};throw Error('UNEXPECTED_OUTSIDE_SQL: '+sql)},
   async transaction(fn){assert.equal(inTx,false);inTx=true;calls.push({phase:'begin'});try{const r=await fn({query:async(sql,params)=>{calls.push({phase:'tx',sql,params});if(dbFailure && sql.includes(dbFailure))throw Error('DB_FAILED');if(sql.includes('FROM users u WHERE u.id=$1'))return {rows:noLockedRow?[]:[{password_hash:lockedHash,suspended_at:lockedSuspended?new Date():null,role:userRole,admin_mfa_required:userRole==='ORG_ADMIN'}]};if(sql.includes('SELECT password_hash FROM users WHERE id=$1'))return {rows:[{password_hash:'argon2-old'}]};if(sql.includes('SELECT enabled FROM auth_mfa_credentials WHERE user_id=$1'))return {rows:[{enabled:currentMfa}]};return {rows:[],rowCount:1}}});calls.push({phase:'commit'});return r;}catch(err){calls.push({phase:'rollback'});throw err;}finally{inTx=false;}}
 };
 const service=new mod.exports.AuthenticationService(db,{}, {write:async(_tx,_user,kind,_table,_id,details)=>{calls.push({phase:'audit',kind,details})}});
 service.publicSession=async user=>{assert.equal(inTx,true,'session creation must occur while credential lock is held');minted++;calls.push({phase:'session',user});return {accessToken:'new-access',user}};
 return {calls,service,minted:()=>minted};
}
const login=(x,pass='correct-old')=>x.service.login({email:'owner@example.ug',password:pass});
const change=(x)=>x.service.changePassword({id:'user-1',organizationId:'org-1',role:'CLIENT'},'session-current',{currentPassword:'correct-old',newPassword:'new-password-2026'});

test('RED/GREEN: old password verified before change must not create a new session after digest rotates',async()=>{
 const x=build({lockedHash:'argon2-new'});await assert.rejects(()=>login(x),UnauthorizedException);assert.equal(x.minted(),0);
 assert.equal(x.calls.at(-1).phase,'rollback');assert(!x.calls.some(c=>c.phase==='session'));
});
test('RED/GREEN: changed password cannot mint pending MFA challenge after commit',async()=>{
 const x=build({mfa:true,lockedHash:'argon2-new'});await assert.rejects(()=>login(x),UnauthorizedException);
 assert(!x.calls.some(c=>c.sql?.includes('INSERT INTO auth_login_challenges')));
});
test('login reads current user digest under a database transaction row lock',async()=>{
 const x=build();await login(x);const row=x.calls.find(c=>c.sql?.includes('FROM users u WHERE u.id=$1'));
 assert(row);assert.match(row.sql,/FOR SHARE/);assert.deepEqual(Array.from(row.params),['user-1','org-1']);
 assert(x.calls.findIndex(c=>c.phase==='session')<x.calls.findIndex(c=>c.phase==='commit'));
});
test('login must reject a suspended user even if initial query saw active account',async()=>{
 const x=build({lockedSuspended:true});await assert.rejects(()=>login(x),UnauthorizedException);assert.equal(x.minted(),0);
});
test('login must reject a deleted user even if initial lookup succeeded',async()=>{
 const x=build({noLockedRow:true});await assert.rejects(()=>login(x),UnauthorizedException);assert.equal(x.minted(),0);
});
test('successful MFA login challenges are inserted while account credential row is locked',async()=>{
 const x=build({mfa:true});const result=await login(x);assert.equal(result.mfaRequired,true);assert.equal(x.minted(),0);
 const lock=x.calls.findIndex(c=>c.sql?.includes('FROM users u WHERE u.id=$1'));
 const challenge=x.calls.findIndex(c=>c.sql?.includes('INSERT INTO auth_login_challenges'));
 const commit=x.calls.findIndex(c=>c.phase==='commit');assert(lock>=0&&challenge>lock&&commit>challenge);
 assert.equal(x.calls[challenge].phase,'tx');
});
test('failed MFA challenge insert cannot create or return a valid challenge',async()=>{
 const x=build({mfa:true,dbFailure:'INSERT INTO auth_login_challenges'});await assert.rejects(()=>login(x),/DB_FAILED/);
 assert.equal(x.calls.at(-1).phase,'rollback');
});
test('invalid login password cannot enter session transaction or mint a challenge',async()=>{
 const x=build({mfa:true});await assert.rejects(()=>login(x,'wrong'),UnauthorizedException);
 assert(!x.calls.some(c=>c.phase==='begin'));assert.equal(x.minted(),0);
});
test('newly enabled MFA cannot be bypassed by a credential lookup that predates confirmation',async()=>{
 const x=build({mfa:false,currentMfa:true});const result=await login(x);assert.equal(result.mfaRequired,true);assert.equal(x.minted(),0);
 assert(x.calls.findIndex(c=>c.sql?.includes('SELECT enabled FROM auth_mfa_credentials'))>x.calls.findIndex(c=>c.sql?.includes('FROM users u WHERE u.id=$1')));
});
test('login reuses no stale ORG_ADMIN role if locked account role changed',async()=>{
 const x=build({userRole:'ORG_ADMIN'});const session=await login(x);assert.equal(session.user.adminMfaRequired,true);
});

test('RED/GREEN: password change revokes all outstanding MFA login challenges atomically',async()=>{
 const x=build();await change(x);const p=x.calls.find(c=>c.sql?.includes('UPDATE auth_login_challenges SET consumed_at=now()'));
 assert(p);assert.equal(p.phase,'tx');assert.deepEqual(Array.from(p.params),['user-1']);assert.match(p.sql,/consumed_at IS NULL/);
});
test('RED/GREEN: password change invalidates all unused password-reset requests atomically',async()=>{
 const x=build();await change(x);const p=x.calls.find(c=>c.sql?.includes('UPDATE auth_password_reset_requests SET revoked_at=now()'));
 assert(p);assert.equal(p.phase,'tx');assert.deepEqual(Array.from(p.params),['user-1']);assert.match(p.sql,/consumed_at IS NULL/);assert.match(p.sql,/revoked_at IS NULL/);
});
test('revocations execute after password replacement and before commit/audit',async()=>{
 const x=build();await change(x);const at=str=>x.calls.findIndex(c=>c.sql?.includes(str));
 const pwd=at('UPDATE users SET password_hash'),challenge=at('UPDATE auth_login_challenges SET consumed_at'),reset=at('UPDATE auth_password_reset_requests SET revoked_at');
 const audit=x.calls.findIndex(c=>c.phase==='audit'),commit=x.calls.findIndex(c=>c.phase==='commit');
 assert(pwd>=0&&pwd<challenge&&challenge<reset&&reset<audit&&audit<commit);
});
test('password changes continue revoking all other sessions while preserving the initiating session',async()=>{
 const x=build();await change(x);const p=x.calls.find(c=>c.sql?.includes("revocation_reason='PASSWORD_CHANGED'"));
 assert(p);assert.match(p.sql,/id<>\$2/);assert.deepEqual(Array.from(p.params),['user-1','session-current']);
});
test('password change failure revoking challenges cannot commit without invalidation',async()=>{
 const x=build({dbFailure:'UPDATE auth_login_challenges SET consumed_at'});await assert.rejects(()=>change(x),/DB_FAILED/);
 assert.equal(x.calls.at(-1).phase,'rollback');assert(!x.calls.some(c=>c.phase==='audit'));
});
test('password change failure revoking reset links cannot commit without invalidation',async()=>{
 const x=build({dbFailure:'UPDATE auth_password_reset_requests SET revoked_at'});await assert.rejects(()=>change(x),/DB_FAILED/);
 assert.equal(x.calls.at(-1).phase,'rollback');assert(!x.calls.some(c=>c.phase==='audit'));
});
test('password change event records only boolean invalidation proof, no secrets',async()=>{
 const x=build();await change(x);const audit=x.calls.find(c=>c.phase==='audit');
 assert.equal(audit.kind,'PASSWORD_CHANGED');assert.deepEqual(Object.keys(audit.details).sort(),['otherSessionsRevoked','pendingChallengesInvalidated','pendingResetLinksInvalidated']);
 assert(!JSON.stringify(audit.details).includes('password'));
});
test('changePassword still checks old password under FOR UPDATE lock',async()=>{
 const x=build();await change(x);const row=x.calls.find(c=>c.sql?.includes('SELECT password_hash FROM users'));
 assert(row);assert.match(row.sql,/FOR UPDATE/);
});
test('no migration or altered tenant isolation is introduced for password lifecycle fixes',()=>{
 const sql=fs.readdirSync(path.join(root,'apps/api/sql')).filter(f=>/^\d+_.*\.sql$/.test(f));assert.equal(sql.length,27);
 assert.match(source,/AuthGuard implements CanActivate/);assert.match(source,/adminMfaRequired/);
});
test('CI must require the v83 suite before live integrations',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
 assert.match(workflow,/npm run verify:v83/);
 const script=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts;
 assert.match(script['verify:v83'],/tools\/tests-v83/);
});

function mfaCompletionFixture({ownerExists=true,active=true,challengeAvailable=true,failAt=null}={}){
 const x=build(),trace=[];let inTx=false;
 x.service.db={transaction:async fn=>{
  assert.equal(inTx,false);inTx=true;trace.push('BEGIN');
  try{const result=await fn({query:async(sql,params)=>{
   trace.push(sql);
   if(failAt&&sql.includes(failAt))throw Error('DB_FAILED');
   if(sql.includes('SELECT user_id FROM auth_login_challenges'))return {rows:ownerExists?[{user_id:'user-1'}]:[]};
   if(sql.includes('SELECT id FROM users WHERE id=$1 AND suspended_at IS NULL'))return {rows:active?[{id:'user-1'}]:[]};
   if(sql.includes('SELECT c.id,c.user_id,c.expires_at'))return {rows:challengeAvailable?[{id:'challenge-1',user_id:'user-1',expires_at:new Date(Date.now()+60000),attempts:0,consumed_at:null,enabled:true,secret_ciphertext:'cipher',last_used_step:-1,organization_id:'org-1'}]:[]};
   return {rows:[],rowCount:1};
  }});trace.push('COMMIT');return result;}
  catch(err){trace.push('ROLLBACK');throw err;}finally{inTx=false;}
 }};
 x.service.lookup=async(id,org)=>{assert(inTx);trace.push('lookup');return {id,organizationId:org,role:'ORG_ADMIN'};};
 x.service.publicSession=async()=>{assert(inTx,'MFA session must be minted while user lock is held');trace.push('session');return {sessionId:'sess-1',accessToken:'token-1',user:{id:'user-1'}};};
 return {service:x.service,trace};
}
test('MFA completion locks current user before challenge row and session creation',async()=>{
 const x=mfaCompletionFixture();const result=await x.service.completeMfa({challengeToken:'sample',code:'123456'});
 assert.equal(result.accessToken,'token-1');const lock=x.trace.findIndex(c=>typeof c==='string'&&c.includes('FOR SHARE')&&c.includes('FROM users'));
 const challenge=x.trace.findIndex(c=>typeof c==='string'&&c.includes('FOR UPDATE OF c,m'));const session=x.trace.indexOf('session');
 assert(lock>=0&&challenge>lock&&session>challenge&&x.trace.indexOf('COMMIT')>session);
 assert(x.trace.some(c=>typeof c==='string'&&c.includes('UPDATE auth_sessions SET mfa_verified_at=now()')));
});
test('MFA completion denies challenge from an account suspended after challenge issuance',async()=>{
 const x=mfaCompletionFixture({active:false});await assert.rejects(()=>x.service.completeMfa({challengeToken:'sample',code:'123456'}),UnauthorizedException);
 assert(!x.trace.includes('session'));assert(!x.trace.some(c=>typeof c==='string'&&c.includes('FOR UPDATE OF c,m')));
});
test('MFA completion denies missing challenge without locking or creating a session',async()=>{
 const x=mfaCompletionFixture({ownerExists:false});await assert.rejects(()=>x.service.completeMfa({challengeToken:'missing',code:'123456'}),UnauthorizedException);
 assert(!x.trace.includes('session'));assert(!x.trace.some(c=>typeof c==='string'&&c.includes('FOR SHARE')));
});
test('MFA completion rejects expired or consumed challenge without minting a session',async()=>{
 const x=mfaCompletionFixture({challengeAvailable:false});await assert.rejects(()=>x.service.completeMfa({challengeToken:'sample',code:'123456'}),UnauthorizedException);
 assert(!x.trace.includes('session'));
});
test('MFA completion rolls back challenge consumption if session verification write fails',async()=>{
 const x=mfaCompletionFixture({failAt:'UPDATE auth_sessions SET mfa_verified_at=now()'});
 await assert.rejects(()=>x.service.completeMfa({challengeToken:'sample',code:'123456'}),/DB_FAILED/);
 assert(x.trace.includes('ROLLBACK'));assert(!x.trace.includes('COMMIT'));
});
test('MFA enrollment checks current password while account is locked against credential change',async()=>{
 const x=build();const queries=[];
 x.service.db={transaction:async fn=>fn({query:async(sql,params)=>{queries.push(sql);
  if(sql.includes('SELECT password_hash FROM users WHERE id=$1'))return {rows:[{password_hash:'argon2-old'}]};
  if(sql.includes('SELECT enabled FROM auth_mfa_credentials'))return {rows:[]};
  return {rows:[],rowCount:1};
 }})};
 await x.service.beginMfa({id:'user-1',organizationId:'org-1',email:'owner@example.ug'},'correct-old');
 assert.match(queries[0],/FOR NO KEY UPDATE/);assert(queries[0].includes('suspended_at IS NULL'));
 assert(queries.findIndex(q=>q.includes('auth_mfa_credentials'))>0);
});
test('MFA enrollment rejects password invalidated before its row lock is acquired',async()=>{
 const x=build();let credentialTouched=false;
 x.service.db={transaction:async fn=>fn({query:async sql=>{
  if(sql.includes('SELECT password_hash FROM users WHERE id=$1'))return {rows:[{password_hash:'argon2-new'}]};
  if(sql.includes('auth_mfa_credentials'))credentialTouched=true;
  return {rows:[]};
 }})};
 await assert.rejects(()=>x.service.beginMfa({id:'user-1',organizationId:'org-1',email:'owner@example.ug'},'correct-old'),UnauthorizedException);
 assert.equal(credentialTouched,false);
});
test('MFA confirmation takes a conflicting account row lock before activating authenticator',async()=>{
 const x=build(),sql=[];
 x.service.db={transaction:async fn=>fn({query:async statement=>{sql.push(statement);
  if(statement.includes('SELECT id FROM users WHERE id=$1'))return {rows:[{id:'user-1'}]};
  if(statement.includes('SELECT secret_ciphertext,enabled,last_used_step FROM auth_mfa_credentials'))return {rows:[{secret_ciphertext:'enc',enabled:false,last_used_step:-1}]};
  if(statement.includes('UPDATE auth_sessions SET mfa_verified_at=now()'))return {rows:[{id:'sess-1'}],rowCount:1};
  return {rows:[],rowCount:1};
 }})};
 await x.service.confirmMfa({id:'user-1',organizationId:'org-1'},'sess-1','123456');
 assert.match(sql[0],/FOR NO KEY UPDATE/);assert(sql.findIndex(q=>q.includes('SELECT secret_ciphertext'))>0);
});
test('MFA confirmation cannot proceed for account suspended before activation',async()=>{
 const x=build();let touchedMfa=false;
 x.service.db={transaction:async fn=>fn({query:async sql=>{if(sql.includes('auth_mfa_credentials'))touchedMfa=true;return {rows:[]};}})};
 await assert.rejects(()=>x.service.confirmMfa({id:'user-1',organizationId:'org-1'},'sess-1','123456'),UnauthorizedException);
 assert.equal(touchedMfa,false);
});
