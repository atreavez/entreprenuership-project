'use strict';
/** Executes the actual v0.22 TypeScript repository/service methods against strict simulated
 * SQL responses. NOT a live PostgreSQL or HTTP integration test. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const ts=require('../test-typescript-loader.cjs');
const base=path.resolve(__dirname,'../../apps/api/src');
const repoFile=path.join(base,'contexts/professional-trust/infrastructure/pg-trust.repository.ts');
const serviceFile=path.join(base,'professional-trust.ts');
const repoSource=fs.readFileSync(repoFile,'utf8');
const serviceSource=fs.readFileSync(serviceFile,'utf8');
const noopDecorator=()=>()=>{};
class ForbiddenException extends Error{}
class NotFoundException extends Error{}
class BadRequestException extends Error{}
class ConflictException extends Error{}
const nest={Injectable:noopDecorator,Controller:noopDecorator,Get:noopDecorator,Post:noopDecorator,Param:noopDecorator,Req:noopDecorator,Body:noopDecorator,UseGuards:noopDecorator,Module:noopDecorator,BadRequestException,ForbiddenException,NotFoundException,ConflictException};
class Placeholder {}
const trustPolicy={TrustPolicyError:class extends Error{},canSubmitProfession:()=>true,validateLicenceExpiry:()=>Date.now()+100000000,validateExternalVerification:()=>{},TRUST_DISCLAIMER:'Testing evidence is not a title certificate'};
function loadClass(file,imports,exported){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 const sandbox={module:{exports:{}},exports:{},require:(id)=>{if(id in imports)return imports[id];throw new Error('Unexpected import: '+id)},Date,Buffer,console};sandbox.exports=sandbox.module.exports;
 vm.runInNewContext(js,sandbox,{filename:file,timeout:5000});
 assert.equal(typeof sandbox.module.exports[exported],'function');
 return sandbox.module.exports[exported];
}
const PgTrustRepository=loadClass(repoFile,{'@nestjs/common':nest,'../../../common':{uid:randomUUID}},'PgTrustRepository');
const ProfessionalTrustService=loadClass(serviceFile,{'@nestjs/common':nest,'@nestjs/throttler':{Throttle:noopDecorator},'./common':{uid:randomUUID,isUuid:x=>x,text:v=>v,optionalText:v=>v},'./contexts/professional-trust/domain/trust-policy':trustPolicy,'./auth':{AuthGuard:Placeholder,AuthModule:Placeholder},'./audit':{AuditModule:Placeholder},'./contexts/professional-trust/application/trust-usecases':{ReviewProfessionalApplication:Placeholder},'./contexts/professional-trust/infrastructure/pg-trust.repository':{PgTrustRepository:Placeholder}},'ProfessionalTrustService');
const user={id:'reviewer-22',organizationId:'reviewer-organization',role:'REVIEWER'};
function authQuery(sql,expired){const expiryChecked=/\bs\.expires_at\s*>\s*now\(\)/i.test(sql);return (!expired||!expiryChecked)?{rows:[{id:user.id,organization_id:user.organizationId,appointment_reference:'AT-22',enabled:true}],rowCount:1}:{rows:[],rowCount:0};}
function repositoryFixture(expired){const queries=[];const db={transaction:async fn=>fn({query:async sql=>{queries.push(sql);if(/FROM platform_trust_reviewers pr/i.test(sql))return authQuery(sql,expired);throw new Error('Unexpected transaction SQL: '+sql)}})};const repo=new PgTrustRepository(db,{write:async()=>{}});return {queries,run:()=>repo.transaction(tx=>tx.getActor(user.id,'session-22'))}}
function serviceFixture(expired){const queries=[];let writes=0;const db={query:async sql=>{queries.push(sql);if(/FROM platform_trust_reviewers pr/i.test(sql))return authQuery(sql,expired);throw new Error('Unexpected service SQL: '+sql)},transaction:async fn=>fn({query:async sql=>{queries.push(sql);if(/FROM platform_trust_reviewers pr/i.test(sql))return authQuery(sql,expired);if(/SELECT organization_id FROM users/i.test(sql))return {rows:[{organization_id:'other-organization'}]};if(/UPDATE professional_accreditations/i.test(sql)){writes++;return {rows:[{user_id:'target-22'}]}}if(/UPDATE users/i.test(sql)){writes++;return {rows:[]}}throw new Error('Unexpected SQL: '+sql)}})};const svc=new ProfessionalTrustService(db,{write:async()=>{}},{});return {svc,queries,get writes(){return writes}}}

test('RED/GREEN: an expired session cannot cast a trust-review attestation inside repository transaction',async()=>{const f=repositoryFixture(true);const actor=await f.run();assert.equal(actor.appointed,false)});
test('an unexpired and MFA-verified session remains authorized for independent review',async()=>{const f=repositoryFixture(false);const actor=await f.run();assert.equal(actor.appointed,true)});
test('repository authorization uses expiry and row locks within the transaction',async()=>{const f=repositoryFixture(false);await f.run();assert.match(f.queries[0],/s\.expires_at\s*>\s*now\(\)/);assert.match(f.queries[0],/FOR SHARE OF u,pr,m,s/)});
test('RED/GREEN: expired sessions cannot read the professional review queue',async()=>{const f=serviceFixture(true);await assert.rejects(()=>f.svc.staff(user,'session-22'),ForbiddenException)});
test('unexpired sessions retain reviewer queue authorization',async()=>{const f=serviceFixture(false);await f.svc.staff(user,'session-22');assert.equal(f.queries.length,1)});
test('RED/GREEN: expired session is denied inside the accreditation revocation transaction',async()=>{const f=serviceFixture(true);f.svc.staff=async()=>{};await assert.rejects(()=>f.svc.revoke(user,'session-22','target-22',{reason:'Independent documentation shows expired accreditation.'}),ForbiddenException);assert.equal(f.writes,0)});
test('valid session can revoke a different organization credential with evidence',async()=>{const f=serviceFixture(false);f.svc.staff=async()=>{};const result=await f.svc.revoke(user,'session-22','target-22',{reason:'Independent documentation shows expired accreditation.'});assert.equal(result.ok,true);assert.equal(f.writes,2)});
test('both HTTP precheck and transactional revocation require unexpired session',async()=>{const f=serviceFixture(false);await f.svc.staff(user,'session-22');f.svc.staff=async()=>{};await f.svc.revoke(user,'session-22','target-22',{reason:'Independent documentation shows expired accreditation.'});assert.equal(f.queries.filter(sql=>/FROM platform_trust_reviewers pr/i.test(sql)).length,2);for(const sql of f.queries.filter(sql=>/FROM platform_trust_reviewers pr/i.test(sql)))assert.match(sql,/s\.expires_at\s*>\s*now\(\)/)});
