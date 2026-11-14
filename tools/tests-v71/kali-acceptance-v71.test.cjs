'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const v71=require('../kali-acceptance-v71.cjs');
const v70=require('../local-kali-integration-v70.cjs');
const ROOT=path.resolve(__dirname,'../..');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v71-'));
 for(const dir of ['apps/api','apps/web'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'compose.integration-v70.yaml'),path.join(root,'compose.integration-v70.yaml'));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'assettrust-platform',version:'0.71.0',scripts:{'db:migrate':'mock','test:pg:runtime-role:v57':'mock'}}));
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
const env=()=>({ASSETTRUST_V71_ACCEPTANCE_CONFIRM:'YES',ASSETTRUST_V70_LOCAL_CONFIRM:'YES',NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function buildFixture(root){
 for(const rel of ['package-lock.json','apps/api/dist/main.js','apps/web/dist/index.html']){
  const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'test-only fixture');
 }
}
function savedRole(root){
 const p=v70.paths(root),obj=v70.load({root});const url=new URL(obj.env.DATABASE_URL);
 url.username='assettrust_v57_ci_runtime';url.password='a-test-only-password';
 fs.writeFileSync(p.role,'ASSETTRUST_RUNTIME_DATABASE_URL='+url.toString()+'\n',{mode:0o600});
 fs.chmodSync(p.role,0o600);
}
function fakeBuild(root){
 const dir=path.join(root,'test-evidence/v68');fs.mkdirSync(dir,{recursive:true});
 const steps=['lockfile','install','dependency-audit','compile','artifact-policy','milestone-regression'];
 const evidence={status:'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED',version:'0.71.0',prerequisites:{ok:true},
  sourceManifestSha256:sha(path.join(root,'package.json')),lockfileSha256:sha(path.join(root,'package-lock.json')),
  steps:steps.map(id=>({id,passed:true}))};
 fs.writeFileSync(path.join(dir,'build-acceptance.json'),JSON.stringify(evidence));
 return path.join(dir,'build-acceptance.json');
}
function stageRunner(failureAt){let i=0;return ()=>{i++;return {status:i===failureAt?1:0,stdout:'TOKEN=confidential_secret',stderr:'postgres://admin:password@127.0.0.1/assettrust_test'};};}
function options(root,extra={}){return {root,env:env(),buildRunner:()=>({status:0}),artifactsReady:()=>true,buildEvidenceReady:()=>true,runner:stageRunner(),...extra};}
function evidenceFiles(root){const d=path.join(root,'.assettrust-local/v70/evidence');return fs.existsSync(d)?fs.readdirSync(d).map(x=>path.join(d,x)):[];}

test('v71 version consistency and CI tests are registered',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 assert.match(pkg.version,/^0\.(?:7[1-9]|[89][0-9]|[1-9][0-9]{2,})\.0$/);
 for(const f of ['apps/api/package.json','apps/web/package.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,f))).version,pkg.version);
 for(const cmd of ['verify:v71','kali:acceptance:plan:v71','kali:acceptance:inspect:v71','kali:acceptance:run:v71'])assert.ok(pkg.scripts[cmd]);
 assert.match(fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8'),/npm run verify:v71/);
});
test('plan explicitly remains non-production and no commands execute',()=>{
 assert.equal(v71.plan().status,'NOT_EXECUTED');assert.equal(v71.plan().productionApproved,false);
 assert.equal(v71.plan().stages.length,7);
});
test('inspection remains read-only and returns no secrets',()=>fixture(root=>{
 const before=fs.readdirSync(root).length;
 const out=v71.inspect({root});assert.equal(out.releaseStatus,'NO_GO');
 assert.equal(out.privateFixtureConfigured,false);assert.equal(fs.readdirSync(root).length,before);
 assert.doesNotMatch(JSON.stringify(out),/postgres:\/\//);
}));
test('production and missing authorizations cannot start operations',()=>fixture(root=>{
 v70.prepare({root});
 for(const opts of [{},{ASSETTRUST_V71_ACCEPTANCE_CONFIRM:'YES'},
   {...env(),NODE_ENV:'production'}, {...env(),CI:'false'}]){
  assert.throws(()=>v71.execute({root,env:opts,buildRunner:()=>{throw Error('must not run')}}),/V71_EXPLICIT_DISPOSABLE_ACCEPTANCE_AUTHORIZATION_REQUIRED/);
 }
 assert.equal(evidenceFiles(root).length,0);
}));
test('invalid private fixture is rejected before invoking build',()=>fixture(root=>{
 assert.throws(()=>v71.execute(options(root,{buildRunner:()=>{throw Error('MUST_NOT_RUN')}})),/LOCAL_SETUP_NOT_PREPARED/);
}));
test('build stage gets only sanitized, test-only environment',()=>fixture(root=>{
 v70.prepare({root});buildFixture(root);savedRole(root);
 let observed;
 const custom={...env(),ASSETTRUST_E2E_ALLOW_MUTATION:'YES',JWT_SECRET:'really-secret',DATABASE_URL:'postgres://remote:password@remote/production',MFA_ENCRYPTION_KEY:'keep-secret'};
 v71.execute(options(root,{env:custom,buildRunner:(pr,args,opt)=>{observed=opt.env;return {status:1};}}));
 assert.ok(observed);assert.equal(observed.DATABASE_URL,undefined);assert.equal(observed.JWT_SECRET,undefined);
 assert.equal(observed.MFA_ENCRYPTION_KEY,undefined);assert.equal(observed.ASSETTRUST_V70_LOCAL_CONFIRM,undefined);
 assert.equal(observed.ASSETTRUST_V71_ACCEPTANCE_CONFIRM,undefined);assert.equal(observed.ASSETTRUST_E2E_ALLOW_MUTATION,undefined);assert.equal(observed.NODE_ENV,'test');assert.equal(observed.ASSETTRUST_V68_BUILD_CONFIRM,'YES');
}));
test('first build failure stops before docker and writes only structured evidence',()=>fixture(root=>{
 v70.prepare({root});const result=v71.execute(options(root,{buildRunner:()=>({status:1,stderr:'postgres://admin:hunter2@localhost secret-api-key=abc'}),runner:()=>{throw Error('Docker should not execute')}}));
 assert.equal(result.stage,'authentic-build');assert.equal(result.status,'FAILED');
 const files=evidenceFiles(root);assert.equal(files.length,1);
 const content=fs.readFileSync(files[0],'utf8');const report=JSON.parse(content);
 assert.equal(report.steps.length,1);assert.equal(report.firstFailure.stage,'authentic-build');
 assert.equal(report.logsIncluded,false);assert.equal(report.credentialsIncluded,false);
 assert.doesNotMatch(content,/hunter2|secret-api-key|postgres:\/\//);
 assert.equal(fs.statSync(files[0]).mode&0o077,0);
}));
test('successful fake build without provenance evidence is rejected',()=>fixture(root=>{
 v70.prepare({root});
 const result=v71.execute(options(root,{buildEvidenceReady:()=>false,runner:()=>{throw Error('should not reach docker')}}));
 assert.equal(result.stage,'build-artifact-provenance');assert.equal(evidenceFiles(root).length,1);
}));
test('authentic provenance requires all six ordered build stages and manifest hashes',()=>fixture(root=>{
 buildFixture(root);const file=fakeBuild(root);
 assert.equal(v71.reviewBuildEvidence(root),true);
 const report=JSON.parse(fs.readFileSync(file));report.steps[3].passed=false;
 fs.writeFileSync(file,JSON.stringify(report));assert.equal(v71.reviewBuildEvidence(root),false);
 report.steps[3].passed=true;fs.writeFileSync(file,JSON.stringify(report));
 fs.appendFileSync(path.join(root,'package.json'),' ');assert.equal(v71.reviewBuildEvidence(root),false);
}));
test('provenance rejects missing lockfile, tampered version or truncated build steps',()=>fixture(root=>{
 buildFixture(root);const file=fakeBuild(root);
 let report=JSON.parse(fs.readFileSync(file));report.version='0.70.0';fs.writeFileSync(file,JSON.stringify(report));
 assert.equal(v71.reviewBuildEvidence(root),false);
 report.version='0.71.0';report.steps.pop();fs.writeFileSync(file,JSON.stringify(report));
 assert.equal(v71.reviewBuildEvidence(root),false);
 fs.unlinkSync(path.join(root,'package-lock.json'));assert.equal(v71.reviewBuildEvidence(root),false);
}));
test('successful simulated sequence writes non-release evidence, never stdout or URLs',()=>fixture(root=>{
 v70.prepare({root});buildFixture(root);savedRole(root);
 const stages=[];const fake=()=>({status:0,stdout:'SECRET=a',stderr:'postgres://secrets:pass@localhost'});
 const result=v71.execute(options(root,{runner:()=>fake(),v70Run:(stage,{runner})=>{stages.push(stage);runner('npm',['test'],{env:{}});return {status:'COMMANDS_PASSED_RELEASE_BLOCKED'};}}));
 assert.equal(result.status,'ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED');
 assert.deepEqual(stages,['--start','--start-scanner','--migrate','--verify','--run-http']);
 const report=JSON.parse(fs.readFileSync(evidenceFiles(root)[0],'utf8'));
 assert.equal(report.releaseStatus,'NO_GO');assert.equal(report.steps.length,7);
 assert.equal(report.steps[4].reusedExistingRole,true);assert.equal(report.status,'ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED');
 assert.doesNotMatch(JSON.stringify(report),/SECRET=a|secrets:pass|postgres:\/\//);
}));
test('brand new role is provisioned in correct order before verify',()=>fixture(root=>{
 v70.prepare({root});buildFixture(root);
 const stages=[];
 const result=v71.execute(options(root,{v70Run:(stage,{runner})=>{stages.push(stage);runner('npm',['test'],{});return {status:'COMMANDS_PASSED_RELEASE_BLOCKED'};}}));
 assert.equal(result.status,'ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED');
 assert.deepEqual(stages,['--start','--start-scanner','--migrate','--provision','--verify','--run-http']);
}));
test('any failed subcommand stops before migration and reports stage without output',()=>fixture(root=>{
 v70.prepare({root});buildFixture(root);savedRole(root);
 const calls=[];let count=0;
 const result=v71.execute(options(root,{v70Run:(stage,{runner})=>{
  calls.push(stage);return runner('docker',[],{}).status===0?{status:'COMMANDS_PASSED_RELEASE_BLOCKED'}:{status:'FAILED'};
 },runner:()=>{count++;return {status:count===2?42:0,stderr:'password=classified'};}}));
 assert.equal(result.status,'FAILED');assert.equal(result.stage,'local-clamav');
 assert.deepEqual(calls,['--start','--start-scanner']);
 const report=JSON.parse(fs.readFileSync(evidenceFiles(root)[0]));
 assert.equal(report.firstFailure.exitCode,42);assert.equal(report.steps.length,3);
 assert.doesNotMatch(JSON.stringify(report),/classified/);
}));
test('a supposed passing v70 step with zero child commands must fail closed',()=>fixture(root=>{
 v70.prepare({root});buildFixture(root);
 const result=v71.execute(options(root,{v70Run:()=>({status:'COMMANDS_PASSED_RELEASE_BLOCKED'})}));
 assert.equal(result.status,'FAILED');assert.equal(result.stage,'isolated-postgis');
}));
test('private evidence directory and filename reject symlink and cross-user access',()=>fixture(root=>{
 v70.prepare({root});
 const target=path.join(root,'.assettrust-local/v70/evidence');fs.symlinkSync(os.tmpdir(),target);
 assert.throws(()=>v71.evidencePath(root),/UNSAFE_PRIVATE_EVIDENCE_DIRECTORY/);
 fs.unlinkSync(target);fs.mkdirSync(target,{mode:0o755});
 assert.throws(()=>v71.evidencePath(root),/UNSAFE_PRIVATE_EVIDENCE_DIRECTORY/);
}));
test('existing evidence file cannot be overwritten',()=>fixture(root=>{
 v70.prepare({root});const file=v71.evidencePath(root);
 v71.writeEvidence(file,{ok:true});assert.throws(()=>v71.writeEvidence(file,{ok:false}),/EVIDENCE_ALREADY_EXISTS/);
}));
test('unexpected child execution errors map only to controlled codes',()=>{
 assert.deepEqual(v71.safeChildResult({status:null,error:{code:'ENOENT'}}),{exitCode:null,signal:null,errorCode:'ENOENT',timedOut:false,passed:false});
 assert.equal(v71.safeChildResult({status:null,error:{code:'SECRET_ABC'}}).errorCode,null);
 assert.equal(v71.safeChildResult({status:0}).passed,true);
});
test('source files and private fixtures remain unchanged by safe --plan/--inspect',()=>{
 const p=path.join(ROOT,'compose.integration-v70.yaml'),shaBefore=sha(p);
 const out=v71.inspect({root:ROOT});assert.equal(out.releaseStatus,'NO_GO');
 assert.equal(v71.plan().productionApproved,false);assert.equal(sha(p),shaBefore);
});

test('private evidence itself is never committed into the source repository',()=>{
 const ignore=fs.readFileSync(path.join(ROOT,'.gitignore'),'utf8');
 assert.match(ignore,/^\.assettrust-local\/$/m);
});
test('read-only command does not authorize destructive operations',()=>{
 assert.equal(v71.plan().productionApproved,false);
 const result=v71.inspect({root:ROOT});
 assert.equal(result.releaseStatus,'NO_GO');
});

test('unexpected build process exception identifies build as first failure without revealing message',()=>fixture(root=>{
 v70.prepare({root});
 const result=v71.execute(options(root,{buildRunner:()=>{throw Error('authorization=Bearer PRIVATE_BUILD_SECRET')}}));
 assert.equal(result.status,'FAILED');assert.equal(result.stage,'authentic-build');
 const raw=fs.readFileSync(evidenceFiles(root)[0],'utf8');
 assert.equal(JSON.parse(raw).firstFailure.stage,'authentic-build');
 assert.doesNotMatch(raw,/PRIVATE_BUILD_SECRET|Bearer/);
}));
