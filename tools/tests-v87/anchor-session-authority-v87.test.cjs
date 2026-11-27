'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../test-typescript-loader.cjs');
const file=path.resolve(__dirname,'../../apps/api/src/contexts/identity/infrastructure/current-admin-step-up.ts');
const mod={exports:{}};class ForbiddenException extends Error{}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>{assert.equal(n,'@nestjs/common');return {ForbiddenException};}});
const {assertCurrentAdminSession,assertCurrentPlatformAdminSession}=mod.exports;
const actor={id:'12345678-1234-4234-8234-123456789abc',organizationId:'22345678-1234-4234-8234-123456789abc',role:'CLIENT'};
const sid='32345678-1234-4234-8234-123456789abc';
function fixture(session=true,appointment=true){
 const calls=[],tx={query:async(sql,args)=>{calls.push({sql,args});return {rows:(sql.includes('platform_admin_appointments')?appointment:session)?[{id:actor.id}]:[]};}};
 return {calls,tx};
}
test('read authority locks current membership and exact active session, never JWT role',async()=>{
 const f=fixture();await assertCurrentAdminSession(f.tx,actor,sid);
 assert.equal(f.calls.length,1);assert.deepEqual(Array.from(f.calls[0].args),[actor.id,actor.organizationId,sid]);
 for(const fragment of ['s.user_id=u.id','s.organization_id=u.organization_id',"u.role='ORG_ADMIN'",'u.suspended_at IS NULL','s.id=$3','s.revoked_at IS NULL','s.expires_at>clock_timestamp()','s.absolute_expires_at>clock_timestamp()','FOR SHARE OF u,s'])assert(f.calls[0].sql.includes(fragment),fragment);
});
test('invalid session identifiers fail before SQL and inactive sessions fail before appointment lookup',async()=>{
 for(const invalid of [undefined,null,'bad','00000000-0000-0000-0000-000000000000']){
  const f=fixture();await assert.rejects(assertCurrentAdminSession(f.tx,actor,invalid),ForbiddenException);assert.equal(f.calls.length,0);
 }
 const f=fixture(false);await assert.rejects(assertCurrentPlatformAdminSession(f.tx,actor,sid),ForbiddenException);assert.equal(f.calls.length,1);
});
test('platform-only operation requires independent live appointment under lock',async()=>{
 const f=fixture(true,false);await assert.rejects(assertCurrentPlatformAdminSession(f.tx,actor,sid),ForbiddenException);assert.equal(f.calls.length,2);
 const good=fixture();await assertCurrentPlatformAdminSession(good.tx,actor,sid);
 assert.match(good.calls[1].sql,/revoked_at IS NULL FOR SHARE/);
 assert.deepEqual(Array.from(good.calls[1].args),[actor.id]);
});
