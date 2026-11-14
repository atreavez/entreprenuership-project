'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const m=require('../local-kali-integration-v70.cjs');
const ROOT=path.resolve(__dirname,'../..');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v70-tests-'));
 fs.mkdirSync(path.join(root,'apps','api'),{recursive:true});
 fs.mkdirSync(path.join(root,'apps','web'),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'compose.integration-v70.yaml'),path.join(root,'compose.integration-v70.yaml'));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'assettrust-platform',scripts:{'db:migrate':'mock','test:pg:runtime-role:v57':'mock'}}));
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function prepare(root){return m.prepare({root});}
function auth(){return {ASSETTRUST_V70_LOCAL_CONFIRM:'YES',NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME};}
function savedRole(root){
 const p=m.paths(root);const config=m.load({root});const u=new URL(config.env.DATABASE_URL);
 u.username='assettrust_v57_ci_runtime';u.password='restricted_role_fresh_password';
 fs.writeFileSync(p.role,'ASSETTRUST_RUNTIME_DATABASE_URL='+u.toString()+'\n',{mode:0o600});
 fs.chmodSync(p.role,0o600);
}
function runner(log,code=0){return (prog,args,opt)=>{log.push({prog,args,env:opt.env,opts:opt});return {status:code,stdout:'',stderr:''};};}

test('v70 scripts, package versions and CI registered',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 assert.match(pkg.version,/^0\.(?:7[0-9]|[89][0-9]|[1-9][0-9]{2,})\.0$/);
 assert.ok(pkg.scripts['verify:v70']&&pkg.scripts['kali:integration:prepare:v70']&&pkg.scripts['kali:integration:http:v70']);
 for(const f of ['apps/api/package.json','apps/web/package.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,f))).version,pkg.version);
 assert.match(fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8'),/npm run verify:v70/);
});
test('dedicated Compose is loopback only and contains no built-in password',()=>{
 const x=fs.readFileSync(path.join(ROOT,'compose.integration-v70.yaml'),'utf8');
 assert.match(x,/127\.0\.0\.1:55432:5432/);
 assert.match(x,/POSTGRES_PASSWORD_FILE: \/run\/secrets\//);
 assert.match(x,/assettrust_test/);assert.match(x,/postgis\/postgis:17-3\.5/);assert.match(x,/127\.0\.0\.1:13310:3310/);
 assert.doesNotMatch(x,/POSTGRES_PASSWORD:\s*[^\n]+/);
 assert.match(x,/\.assettrust-local\/v70\/pg-password/);
 assert.match(fs.readFileSync(path.join(ROOT,'.gitignore'),'utf8'),/^\.assettrust-local\/$/m);
});
test('plan has no side effects and never claims approval',()=>fixture(root=>{
 const before=fs.readdirSync(root).join(',');const x=m.plan();
 assert.equal(x.productionApproved,false);assert.equal(x.sequence.length,7);
 assert.equal(fs.readdirSync(root).join(','),before);
}));
test('rejects unreviewed Compose changes before generating credentials or starting containers',()=>fixture(root=>{
 fs.appendFileSync(path.join(root,'compose.integration-v70.yaml'),'\n# unexpected change');
 assert.throws(()=>m.prepare({root}),/REVIEWED_COMPOSE_CONTRACT_CHANGED/);
 assert.equal(fs.existsSync(path.join(root,'.assettrust-local')),false);
}));
test('prepares cryptographically distinct private files and test-only URL',()=>fixture(root=>{
 const x=prepare(root);const p=m.paths(root),cfg=m.load({root});
 assert.equal(x.status,'LOCAL_SECRET_FILES_CREATED');assert.equal(x.secretValuesExposed,false);
 for(const f of [p.password,p.operator,p.role])assert.equal(fs.statSync(f).mode&0o077,0);
 assert.equal(fs.statSync(p.dir).mode&0o077,0);
 assert.equal(cfg.env.NODE_ENV,'test');assert.equal(cfg.env.CI,'true');
 assert.equal(new URL(cfg.env.DATABASE_URL).pathname,'/assettrust_test');
 assert.equal(new URL(cfg.env.DATABASE_URL).hostname,'127.0.0.1');
 assert.equal(new URL(cfg.env.DATABASE_URL).port,'55432');
 assert.ok(!JSON.stringify(x).includes(new URL(cfg.env.DATABASE_URL).password));
 assert.notEqual(cfg.env.JWT_SECRET,cfg.env.MFA_ENCRYPTION_KEY);
 assert.notEqual(cfg.env.MFA_ENCRYPTION_KEY,JSON.parse(cfg.env.DOCUMENT_ENCRYPTION_KEYS).v70);
}));
test('refuses to overwrite existing generated credentials',()=>fixture(root=>{
 prepare(root);assert.throws(()=>prepare(root),/ALREADY_EXISTS/);
}));
test('rejects symlinked local credential directory',()=>fixture(root=>{
 const p=m.paths(root);fs.symlinkSync(os.tmpdir(),path.dirname(p.dir));
 assert.throws(()=>prepare(root),/ALREADY_EXISTS/);
}));
test('rejects a forged or mismatched runtime credential even in doctor mode',()=>fixture(root=>{
 prepare(root);const p=m.paths(root);
 fs.writeFileSync(p.role,'ASSETTRUST_RUNTIME_DATABASE_URL=postgres://root:pass@remote.example/assettrust_prod\n');
 assert.throws(()=>m.load({root}),/RESTRICTED_RUNTIME_ROLE_CONFIGURATION_INVALID/);
 assert.equal(m.doctor({root}).preparedConfigurationValid,false);
}));
test('rejects read-permissive secret files',()=>fixture(root=>{
 prepare(root);const p=m.paths(root);fs.chmodSync(p.operator,0o644);
 assert.throws(()=>m.load({root}),/PRIVATE_FILE_PERMISSIONS_UNSAFE/);
}));
test('rejects symlinked credential file',()=>fixture(root=>{
 prepare(root);const p=m.paths(root);fs.unlinkSync(p.password);
 fs.symlinkSync('/etc/hosts',p.password);assert.throws(()=>m.load({root}),/REQUIRED_REGULAR_SOURCE_FILE_MISSING/);
}));
test('rejects tampered disposable database identity',()=>fixture(root=>{
 prepare(root);const p=m.paths(root);
 fs.writeFileSync(p.operator,fs.readFileSync(p.operator,'utf8').replace('assettrust_test','assettrust_prod'));
 assert.throws(()=>m.load({root}),/LOCAL_DATABASE_TARGET_INVALID/);
}));
test('doctor reports only non-secret readiness, not raw URLs',()=>fixture(root=>{
 prepare(root);const r=m.doctor({root});
 assert.equal(r.preparedConfigurationValid,true);assert.equal(r.restrictedRuntimeConfigured,false);
 assert.equal(r.liveDatabaseTested,false);assert.equal(r.releaseStatus,'NO_GO');
 assert.doesNotMatch(JSON.stringify(r),/postgres:\/\//);
}));
test('doctor correctly reports missing configuration',()=>fixture(root=>{
 const r=m.doctor({root});assert.equal(r.preparedConfigurationValid,false);assert.equal(r.sourceRecognized,true);
}));
test('rejects live operations without explicit authorization or in production',()=>fixture(root=>{
 prepare(root);
 for(const step of ['--start','--start-scanner','--migrate','--provision','--verify','--run-http']){
  assert.throws(()=>m.run(step,{root,env:{},runner:()=>{throw Error('SHOULD_NOT_RUN')}}),/REQUIRES_EXPLICIT_CONFIRMATION/);
  assert.throws(()=>m.run(step,{root,env:{...auth(),NODE_ENV:'production'},runner:()=>{throw Error('SHOULD_NOT_RUN')}}),/REQUIRES_EXPLICIT_CONFIRMATION/);
 }
}));
test('start invokes only isolated Docker Compose with no operator secret in environment',()=>fixture(root=>{
 prepare(root);const calls=[];const r=m.run('--start',{root,env:auth(),runner:runner(calls)});
 assert.equal(r.status,'COMMANDS_PASSED_RELEASE_BLOCKED');assert.equal(calls.length,1);
 assert.equal(calls[0].prog,'docker');assert.deepEqual(calls[0].args.slice(0,5),['--host','unix:///var/run/docker.sock','compose','-f','compose.integration-v70.yaml']);
 assert.equal(calls[0].env.DATABASE_URL,undefined);assert.equal(calls[0].env.JWT_SECRET,undefined);
}));
test('scanner starts through local Docker socket without credentials in environment',()=>fixture(root=>{
 prepare(root);const calls=[];const r=m.run('--start-scanner',{root,env:auth(),runner:runner(calls)});
 assert.equal(r.status,'COMMANDS_PASSED_RELEASE_BLOCKED');
 assert.deepEqual(calls[0].args.slice(0,5),['--host','unix:///var/run/docker.sock','compose','-f','compose.integration-v70.yaml']);
 assert.ok(calls[0].args.includes('scanner'));assert.equal(calls[0].env.DATABASE_URL,undefined);
}));
test('migration step runs two commands in order with test-only DB URL',()=>fixture(root=>{
 prepare(root);const calls=[];m.run('--migrate',{root,env:auth(),runner:runner(calls)});
 assert.deepEqual(calls.map(x=>x.args.join(' ')),['run db:migrate','run db:check']);
 assert.equal(calls[0].env.NODE_ENV,'test');assert.equal(new URL(calls[0].env.DATABASE_URL).port,'55432');
}));
test('provisions runtime role only through guarded existing script and private output',()=>fixture(root=>{
 prepare(root);const calls=[];m.run('--provision',{root,env:auth(),runner:runner(calls)});
 assert.deepEqual(calls[0].args,['tools/provision-ci-runtime-role-v57.mjs']);
 assert.equal(calls[0].env.GITHUB_ENV,m.paths(root).role);
 assert.equal(calls[0].env.ASSETTRUST_E2E_ALLOW_MUTATION,'YES');
}));
test('refuses to re-provision restricted role after credential is recorded',()=>fixture(root=>{
 prepare(root);savedRole(root);
 assert.throws(()=>m.run('--provision',{root,env:auth(),runner:()=>{throw Error('SHOULD_NOT_RUN')}}),/ALREADY_PROVISIONED/);
}));
test('verify requires a separate nonowner runtime role',()=>fixture(root=>{
 prepare(root);
 assert.throws(()=>m.run('--verify',{root,env:auth(),runner:()=>{throw Error('SHOULD_NOT_RUN')}}),/NOT_PROVISIONED/);
}));
test('verify checks ledger, runtime login, exact policies and privileges in order',()=>fixture(root=>{
 prepare(root);savedRole(root);const calls=[];m.run('--verify',{root,env:auth(),runner:runner(calls)});
 assert.deepEqual(calls.map(x=>x.args.join(' ')),[
  'run security:clamav:v52','run db:check','run test:pg:runtime-role:v57','run test:pg:policy-contract:v63','run test:pg:runtime-privileges:v60']);
 assert.equal(calls[3].env.ASSETTRUST_V63_POLICY_CONFIRM,'YES');
 assert.ok(calls[0].env.ASSETTRUST_RUNTIME_DATABASE_URL);
}));
test('failures stop subsequent steps and never print raw child output',()=>fixture(root=>{
 prepare(root);const calls=[];const r=m.run('--migrate',{root,env:auth(),runner:runner(calls,1)});
 assert.equal(r.status,'FAILED');assert.equal(r.code,'SCHEMA_MIGRATION_FAILED');
 assert.equal(calls.length,1);assert.doesNotMatch(JSON.stringify(r),/postgres:\/\//);
}));
test('HTTP acceptance refuses missing real build artifacts before invoking any child',()=>fixture(root=>{
 prepare(root);savedRole(root);
 assert.throws(()=>m.run('--run-http',{root,env:auth(),runner:()=>{throw Error('SHOULD_NOT_RUN')}}),/REQUIRED_REGULAR_SOURCE_FILE_MISSING/);
}));
test('HTTP acceptance rejects a failing provenance gate',()=>fixture(root=>{
 prepare(root);savedRole(root);
 for(const rel of ['package-lock.json','apps/api/dist/main.js','apps/web/dist/index.html']){
  const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'fixture');
 }
 assert.throws(()=>m.run('--run-http',{root,env:auth(),artifactsReady:()=>false,runner:()=>{throw Error('SHOULD_NOT_RUN')}}),/REVIEWED_LOCKFILE_AND_COMPILED_ARTIFACTS_REQUIRED/);
}));
test('authorized HTTP step passes private run marker to supervised API, never logs it',()=>fixture(root=>{
 prepare(root);savedRole(root);
 for(const rel of ['package-lock.json','apps/api/dist/main.js','apps/web/dist/index.html']){
  const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'fixture');
 }
 const calls=[];const r=m.run('--run-http',{root,env:auth(),artifactsReady:()=>true,runner:runner(calls)});
 assert.equal(calls.length,1);assert.equal(calls[0].args[0],'tools/ci-live-integration.mjs');
 assert.equal(calls[0].env.ASSETTRUST_E2E_TARGET_ID,calls[0].env.ASSETTRUST_E2E_EXPECT_TARGET);
 assert.equal(r.productionApproved,false);
 assert.doesNotMatch(JSON.stringify(r),/supervisor/);
}));
test('local secret output sanitizer redacts URLs, keys and auth header',()=>{
 const x=m.sanitize('postgres://u:p@127.0.0.1:55432/assettrust_test Bearer abcDEfg.ghi '+('a'.repeat(64)));
 assert.doesNotMatch(x,/u:p|abcDEfg|a{64}/);
});
test('no-op authorization is rejected without running commands',()=>{
 assert.throws(()=>m.authorize('--erase',auth()),/INVALID_OPERATION/);
});
test('prepare requires recognized repository; does not create side effects otherwise',()=>fixture(root=>{
 fs.unlinkSync(path.join(root,'compose.integration-v70.yaml'));
 assert.throws(()=>m.prepare({root}),/REQUIRED_REGULAR_SOURCE_FILE_MISSING/);
 assert.equal(fs.existsSync(path.join(root,'.assettrust-local')),false);
}));
test('command plan and doctor work without network or PostgreSQL',()=>{
 const result=spawnSync(process.execPath,['tools/local-kali-integration-v70.cjs','--plan'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(result.status,0);assert.match(result.stdout,/NOT_EXECUTED/);
});
