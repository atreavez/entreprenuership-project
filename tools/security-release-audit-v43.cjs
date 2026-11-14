'use strict';
/** Read-only evidence checklist; NO passing results should be interpreted as production approval. */
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function check(root=ROOT){
 const read=file=>{try{return fs.readFileSync(path.join(root,file),'utf8')}catch{return ''}};
 const exists=file=>fs.existsSync(path.join(root,file));
 const auth=read('apps/api/src/auth.ts'),api=read('apps/api/src/main.ts'),docs=read('apps/api/src/documents.ts'),db=read('apps/api/src/database.ts'),runtime=read('apps/api/src/contexts/platform/domain/runtime-config.ts'),cookies=read('apps/web/src/api.ts');
 const evidence=[];const record=(control,status,reason)=>evidence.push({control,status,reason});
 record('real-login-and-Argon2id',auth.includes('argon2.argon2id')&&auth.includes('AuthGuard')?'SOURCE_PRESENT_TEST_LIVE':'BLOCKED','Review real credential, MFA, session and revocation integration');
 record('password-reset-single-use-expiration',exists('apps/api/src/contexts/identity/infrastructure/password-reset.service.ts')?'SOURCE_PRESENT_TEST_LIVE':'BLOCKED','v0.44 reset source is present; delivery provider, live PostgreSQL, UI, concurrent replay, real emails and revocation need independent validation');
 record('server-only-credentials',cookies.includes("fetch('/api/v1")&&api.includes('JwtModule')?'SOURCE_PRESENT_TEST_LIVE':'PARTIAL','API responses are visible to callers by design; privileged vendor keys must never be shipped in VITE_ bundles');
 record('tenant-isolation',auth.includes('organization_id')&&docs.includes('organization_id')?'PARTIAL':'BLOCKED','Parameterized tenant filters found; database RLS and adversarial cross-tenant tests not yet proven');
 record('production-HTTPS',read('deploy/Caddyfile.example').includes('Strict-Transport-Security')?'PARTIAL':'BLOCKED','Reverse-proxy example hardened; certificates, redirects, actual ingress TLS must be verified');
 record('server-validation',docs.includes('assertAllowedDocument')?'PARTIAL':'BLOCKED','Some service validations present, but whole DTO/input inventory not audited');
 record('no-public-SSH','UNVERIFIED','Cloud firewall, VPN/bastion and running host SSH rules are external to source snapshot');
 record('safe-SQL',db.includes('pool.query')?'PARTIAL':'BLOCKED','Parameter bindings are used in reviewed queries; entire repository SQL audit and DB role tests pending');
 record('login-rate-limit',exists('apps/api/src/contexts/identity/infrastructure/login-abuse.service.ts')?'SOURCE_PRESENT_TEST_LIVE':'PARTIAL','v0.45 shared PostgreSQL attempt reservation implemented; real database two-instance contention, edge limits and denial-of-service testing still required');
 record('CSRF-cookie-protection',auth.includes('isAllowedRequestOrigin')&&auth.includes('assertSameOrigin(req,true)')?'SOURCE_PRESENT_TEST_LIVE':'BLOCKED','Refresh-cookie mutation now requires exact allowlisted Origin; browser/proxy tests still required');
 record('secure-session-cookies',auth.includes('httpOnly:true')&&auth.includes("sameSite:'strict'")?'SOURCE_PRESENT_TEST_LIVE':'BLOCKED','Secure in production, HttpOnly, Strict SameSite; reverse-proxy HTTPS validation pending');
 record('safe-uploads',docs.includes('fileSize:5*1024*1024')?'PARTIAL':'BLOCKED','Size/MIME/magic checks and encrypted storage found; antimalware, archive, PDF active-content review missing');
 record('admin-lockdown',auth.includes('adminMfaRequired')?'PARTIAL':'BLOCKED','RBAC, MFA and step-up exist; admin URL inventory and access tests incomplete');
 record('server-price-authority','PARTIAL','Quotes are submitted by authorized admins; future payment transactions must recompute prices from server-side policies');
 record('production-debug-off',runtime.includes('DEBUG_PRODUCTION')?'SOURCE_PRESENT_TEST_LIVE':'BLOCKED','Startup rejects DEBUG; deployed error pages and log controls need inspection');
 record('dependencies-audited','BLOCKED','Authentic package-lock.json and installed packages absent; cannot claim update, removal or clean vulnerability audit');
 record('git-history-secrets','BLOCKED','No .git directory bundled in checkpoint; run history-inclusive scanner on canonical repository');
 record('secret-rotation','UNVERIFIED','No authority to revoke keys or access to providers; must rotate any confirmed exposed credentials and invalidate dependent sessions');
 record('database-backup-and-recovery','UNVERIFIED','Requires documented restore drill and tested encryption-key recovery');
 record('CI-and-live-security','PARTIAL','Offline tests exist; npm ci, full build, live PostgreSQL, browsers and two API servers remain required');
 const blocking=evidence.filter(x=>x.status==='BLOCKED'||x.status==='UNVERIFIED'||x.status==='PARTIAL').length;
 return {schema:'ASSETTRUST_SECURITY_RELEASE_AUDIT_V43',productionApproved:false,status:'BLOCKED',blockingOrUnverified: blocking,controls:evidence,notes:'Static inspection does not prove running application safety; release must remain blocked until high/critical findings and deployment evidence are resolved.'};
}
if(require.main===module){const result=check();console.log(JSON.stringify(result,null,2));if(process.argv.includes('--strict-release'))process.exitCode=1;}
module.exports={check};
