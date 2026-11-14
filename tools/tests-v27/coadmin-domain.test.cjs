'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const root=path.resolve(__dirname,'../../apps/api/src');
function load(file,imports={}){const filename=path.join(root,file);const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:id=>{if(id in imports)return imports[id];throw Error('Unexpected require '+id)},Date,Set},{filename,timeout:5000});return module.exports;}
const policy=load('contexts/identity/domain/coadmin-policy.ts');
const now=Date.UTC(2026,10,10);
const inv={role:'ORG_ADMIN',expires_at:new Date(now+60_000).toISOString(),accepted_at:null,revoked_at:null};
test('privileged invitation is single-use, time-bounded and revocable',()=>{
 assert.equal(policy.canAcceptCoAdminInvitation(inv,now),true);
 assert.equal(policy.canAcceptCoAdminInvitation({...inv,accepted_at:new Date()},now),false);
 assert.equal(policy.canAcceptCoAdminInvitation({...inv,revoked_at:new Date()},now),false);
 assert.equal(policy.canAcceptCoAdminInvitation({...inv,role:'REVIEWER'},now),false);
 assert.equal(policy.canAcceptCoAdminInvitation(inv,now+60_000),false);
 assert.equal(policy.canAcceptCoAdminInvitation({...inv,expires_at:'nonsense'},now),false);
 assert.equal(policy.canAcceptCoAdminInvitation(null,now),false);
});
test('only narrow authenticated endpoints allow pending co-admin MFA enrollment',()=>{
 for(const pathname of ['/api/v1/auth/me','/api/v1/auth/mfa/enroll','/api/v1/auth/mfa/confirm','/api/v1/auth/mfa/status','/api/v1/auth/logout','/api/v1/auth/password/change'])assert.equal(policy.isCoAdminEnrollmentRoute(pathname),true);
 for(const pathname of ['/api/v1/team/members','/api/v1/cases','/api/v1/auth/mfa/disable','/api/v1/auth/mfa/step-up','/api/v1/auth/mfa/confirm/anything','/api/v1/auth/mfa/enroll?unsafe=yes','/api/v1/access/grants'])assert.equal(policy.isCoAdminEnrollmentRoute(pathname),false);
});
class ForbiddenException extends Error {}
const infrastructure=load('contexts/identity/infrastructure/current-admin-step-up.ts',{'@nestjs/common':{ForbiddenException}});
const actor={id:'a',organizationId:'o',role:'ORG_ADMIN'};
test('current-role and MFA-step-up SQL rejects missing or stale session',async()=>{
 let seen='';const deny={query:async (sql,params)=>{seen=sql;assert.equal(params[2],'s');return {rows:[]}}};
 await assert.rejects(()=>infrastructure.assertCurrentAdminStepUp(deny,actor,'s'),ForbiddenException);
 assert.match(seen,/s\.revoked_at IS NULL/);
 assert.match(seen,/s\.absolute_expires_at>now\(\)/);
 assert.match(seen,/s\.mfa_verified_at>now\(\)-interval '5 minutes'/);
 assert.match(seen,/m\.enabled=true/);
 assert.match(seen,/u\.role='ORG_ADMIN'/);
 assert.match(seen,/FOR SHARE OF u,s,m/);
});
test('current administrator and recently stepped-up session pass SQL check',async()=>{
 const tx={query:async()=>({rows:[{id:'a'}]})};await infrastructure.assertCurrentAdminStepUp(tx,actor,'s');
});
test('schema migration preserves prior history and introduces permanent MFA requirement',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../apps/api/sql/008_coadmin_invitation.sql'),'utf8');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS admin_mfa_required boolean NOT NULL DEFAULT false/);
 assert.match(sql,/CHECK \(role IN \('ORG_ADMIN'/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS revoked_at/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS accepted_by/);
});
