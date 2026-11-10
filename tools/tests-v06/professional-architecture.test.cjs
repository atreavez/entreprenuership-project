const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
test('domain and application remain independent of framework, SQL and HTTP dependencies',()=>{
 for(const f of ['apps/api/src/contexts/professional-trust/domain/trust-policy.ts','apps/api/src/contexts/professional-trust/application/trust-usecases.ts']){
  const code=read(f);assert.doesNotMatch(code,/from\s+['"](?:@nestjs|pg|express|react|argon2|axios)/);assert.doesNotMatch(code,/@(Controller|Module|Injectable)/);assert.doesNotMatch(code,/\bSELECT\b|\bINSERT\b|\bUPDATE\b/i);
 }
});
test('grants require two attestations and no public endpoint may appoint staff',()=>{
 const domain=read('apps/api/src/contexts/professional-trust/domain/trust-policy.ts');
 const api=read('apps/api/src/professional-trust.ts');
 assert.match(domain,/\.size>=2/);assert.doesNotMatch(api,/@(?:Post|Patch|Put)\(['"](?:appoint|staff|grant-reviewer)/);
 assert.match(api,/await this\.staff\(user,sessionId\)/);assert.match(api,/this\.reviews\.execute/);
});
test('runtime accreditation comes from unrevoked specific role rather than legacy boolean',()=>{
 const auth=read('apps/api/src/auth.ts');assert.match(auth,/professional_accreditations p/);assert.match(auth,/p\.professional_role=u\.role/);assert.match(auth,/p\.expires_at>now\(\)/);assert.match(auth,/p\.revoked_at IS NULL/);
});
test('neither administrator role nor nonaccredited professional may submit restricted expertise',()=>{
 const stage=read('apps/api/src/contexts/verification/domain/evidence-policy.ts');const cases=read('apps/api/src/cases.ts');
 assert.match(stage,/actor\.role==='SURVEYOR'/);assert.match(stage,/actor\.role==='LEGAL_REVIEWER'/);
 assert.match(cases,/assertRole\(u,\['SURVEYOR'\],true\)/);assert.match(cases,/assertRole\(u,\['LEGAL_REVIEWER'\],true\)/);
 assert.doesNotMatch(cases,/assertRole\(u,\['SURVEYOR','ORG_ADMIN'\],true\)/);
});

test('sensitive trust actions require recent MFA verification in the active session',()=>{
 const api=read('apps/api/src/professional-trust.ts');const adapter=read('apps/api/src/contexts/professional-trust/infrastructure/pg-trust.repository.ts');
 assert.match(api,/mfa_verified_at > now\(\)-interval '15 minutes'/);assert.match(adapter,/s\.mfa_verified_at > now\(\)-interval '15 minutes'/);
 const auth=read('apps/api/src/auth.ts');assert.match(auth,/@Post\('mfa\/step-up'\)/);assert.match(auth,/async stepUpMfa/);
});
