'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const {matches,scanWorkingTree,scanGitHistory}=require('../secret-scan-v43.cjs');
const audit=require('../security-release-audit-v43.cjs');
function compile(file){
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'at-v43-'));
 const r=cp.spawnSync('tsc',['--strict','--target','es2022','--module','commonjs','--outDir',out,file],{cwd:ROOT,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr+r.stdout);
 return {module:require(path.join(out,path.basename(file).replace(/\.ts$/,'.js'))),clean:()=>fs.rmSync(out,{recursive:true,force:true})};
}
test('refresh-cookie origin policy allows only exact same-origin approved browser requests',()=>{
 const {module:m,clean}=compile('apps/api/src/contexts/identity/domain/request-origin-policy.ts');
 try{
  const allow=['https://app.example.org'];
  for(const origin of ['https://app.example.org','https://app.example.org/'])assert.equal(m.isAllowedRequestOrigin({origin,fetchSite:'same-origin'},allow,true),origin==='https://app.example.org');
  for(const origin of ['https://app.example.org.evil.tld','http://app.example.org','null','https://app.example.org/path','https://app.example.org,https://evil.tld',undefined])
   assert.equal(m.isAllowedRequestOrigin({origin,fetchSite:'same-origin'},allow,true),false,String(origin));
  for(const fetchSite of ['cross-site','same-site','alien'])assert.equal(m.isAllowedRequestOrigin({origin:allow[0],fetchSite},allow,true),false);
  assert.equal(m.isAllowedRequestOrigin({origin:undefined,fetchSite:'none'},allow,false),true);
 }finally{clean();}
});
test('server refresh endpoint requires Origin and cookies remain secure',()=>{
 const auth=fs.readFileSync(path.join(ROOT,'apps/api/src/auth.ts'),'utf8');
 assert(auth.includes("assertSameOrigin(req,true);const cookie=parseCookie(req)"));
 assert(auth.includes('secure:process.env.NODE_ENV===\'production\''));
 assert(auth.includes('httpOnly:true'));assert(auth.includes("sameSite:'strict'"));
});
test('production runtime rejects public API bind and enabled debug / preview',()=>{
 const {module:m,clean}=compile('apps/api/src/contexts/platform/domain/runtime-config.ts');
 try{
  const env={NODE_ENV:'production',CLAMAV_SOCKET_PATH:'/run/clamav/clamd.ctl',JWT_SECRET:'abcdefghijklmnopqrstuvwxyzABCDEF0123456789@#',MFA_ENCRYPTION_KEY:'0123456789abcdef'.repeat(4),LOGIN_ABUSE_PEPPER:'f4b8a203c7d95e61a0fe39db784106cf291c0bad63e572804bfc7d158e92c03a',DOCUMENT_ACTIVE_KEY_ID:'v1',DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:'fedcba9876543210'.repeat(4)}),DATABASE_URL:'postgres://user:long-random-password@prod.db.example.org:5432/assettrust',WEB_ORIGIN:'https://app.example.org'};
  assert.equal(m.validateRuntimeConfig(env).ok,true);
  for(const edit of [{API_BIND_HOST:'0.0.0.0'},{DEBUG:'assettrust:*'},{VITE_DESIGN_PREVIEW:'true'}])assert.equal(m.validateRuntimeConfig({...env,...edit}).ok,false);
  assert.equal(m.validateRuntimeConfig({...env,API_BIND_HOST:'0.0.0.0',ASSETTRUST_PRIVATE_PROXY_NETWORK:'YES'}).ok,true);
 }finally{clean();}
});
test('example TLS proxy has HSTS and production backend defaults to loopback',()=>{
 const proxy=fs.readFileSync(path.join(ROOT,'deploy/Caddyfile.example'),'utf8');
 assert(proxy.includes('Strict-Transport-Security'));
 const main=fs.readFileSync(path.join(ROOT,'apps/api/src/main.ts'),'utf8');
 assert(main.includes('apiListenHost(process.env)'));
 const runtime=fs.readFileSync(path.join(ROOT,'apps/api/src/contexts/platform/domain/runtime-config.ts'),'utf8');
 const {module:policy,clean}=compile('apps/api/src/contexts/platform/domain/runtime-config.ts');
 try{
  assert.equal(policy.apiListenHost({NODE_ENV:'production'}),'127.0.0.1');
  assert.equal(policy.apiListenHost({NODE_ENV:'development'}),'127.0.0.1');
 }finally{clean();}
 assert(runtime.includes("if(env.NODE_ENV==='test')return '127.0.0.1'"));
});
test('snapshot scanner detects high-confidence credentials without echoing their values',()=>{
 const fake='ghp_'+'F'.repeat(30);
 const kinds=matches(Buffer.from(fake),'src/a.txt');assert(kinds.includes('GITHUB_TOKEN'));
 assert(!JSON.stringify(kinds).includes(fake));
 assert(matches(Buffer.from('dummy text'),'private/identity.pem').includes('SENSITIVE_FILENAME'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'at-v43-src-'));
 try{
  fs.writeFileSync(path.join(dir,'example.txt'),fake);
  assert(scanWorkingTree(dir).issues.some(x=>x.type==='GITHUB_TOKEN'));
  assert.equal(scanGitHistory(dir).complete,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('source scanner completes on AssetTrust v0.43 snapshot',()=>{
 const report=scanWorkingTree(ROOT);
 assert(report.files>150);
 assert.deepEqual(report.issues,[]);
});
test('release preflight remains blocked with explicit unresolved controls',()=>{
 const result=audit.check(ROOT);
 assert.equal(result.productionApproved,false);assert.equal(result.status,'BLOCKED');
 for(const name of ['password-reset-single-use-expiration','tenant-isolation','safe-uploads','dependencies-audited','git-history-secrets']){
  const control=result.controls.find(x=>x.control===name);assert(control);assert.notEqual(control.status,'VERIFIED');
 }
});
test('CI includes v0.43, source scan and npm audit and prohibits fail-open',()=>{
 const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 const {validateCi}=require('../ci-completeness-v41.cjs');
 assert(validateCi({root:ROOT}).ok);
 for(const marker of ['npm run verify:v43','npm run security:scan:v43 -- --history','npm audit --omit=dev --audit-level=high','fetch-depth: 0'])assert(workflow.includes(marker));
});
