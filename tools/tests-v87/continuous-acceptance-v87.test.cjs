'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const TARGET=process.env.ASSETTRUST_V87_TEST_ROOT?path.resolve(process.env.ASSETTRUST_V87_TEST_ROOT):ROOT;
const kali=require(path.join(TARGET,'tools/kali-acceptance-v71.cjs'));
const v70=require(path.join(ROOT,'tools/local-kali-integration-v70.cjs'));
const build=require(path.join(ROOT,'tools/build-acceptance-v68.cjs'));
const provenance=require(path.join(ROOT,'tools/acceptance-provenance-v86.cjs'));
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
function put(root,name,content){const f=path.join(root,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,content);return f;}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v87-'));
 fs.copyFileSync(path.join(ROOT,'compose.integration-v70.yaml'),path.join(root,'compose.integration-v70.yaml'));
 put(root,'package.json',JSON.stringify({name:'assettrust-platform',version:'0.87.0',scripts:{'verify:v87':'node --test tools/tests-v87/*.test.cjs','test:pg:runtime-role:v57':'mock','db:migrate':'mock'}}));
 put(root,'apps/api/package.json',JSON.stringify({name:'@assettrust/api',version:'0.87.0'}));
 put(root,'apps/web/package.json',JSON.stringify({name:'@assettrust/web',version:'0.87.0'}));
 put(root,'package-lock.json','synthetic offline test fixture, never a real lockfile');
 put(root,'apps/api/src/main.ts','export const stage = "safe";');
 put(root,'apps/api/sql/001.sql','SELECT 1;');
 put(root,'apps/api/tsconfig.json','{}');
 put(root,'apps/web/src/main.tsx','export const stage = "safe";');
 put(root,'apps/web/index.html','<!doctype html><div id="root"></div>');
 put(root,'apps/web/tsconfig.json','{}');
 put(root,'apps/web/vite.config.ts','export default {}');
 put(root,'tools/protect.cjs','// protected source');
 put(root,'deploy/Caddyfile','reverse_proxy localhost:4000');
 put(root,'.github/workflows/ci.yml','name: synthetic');
 v70.prepare({root});
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module" src="/assets/index-Clean.js"></script></body></html>';
 const result=build.runAcceptance({root,env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},
  detectFn:()=>({ok:true,version:'0.87.0'}),
  runner:(cmd,args)=>{if(args.join(' ')==='run build'){
    put(root,'apps/api/dist/main.js','console.log("trusted")');
    put(root,'apps/api/dist/other.js','module.exports={trusted:true}');
    put(root,'apps/web/dist/index.html',html);
    put(root,'apps/web/dist/assets/index-Clean.js','console.log("trusted frontend")');
    put(root,'apps/web/dist/assets/index-Clean.css','body{margin:0}');
   }return {status:0,stdout:'',stderr:''};}});
 assert.equal(result.status,'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED',JSON.stringify(result.issues));
 put(root,'test-evidence/v68/build-acceptance.json',JSON.stringify(result));
 assert.equal(provenance.verify(root).ok,true,JSON.stringify(provenance.verify(root).issues));
 return root;
}
function withFixture(fn){const root=fixture();try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
const env={ASSETTRUST_V71_ACCEPTANCE_CONFIRM:'YES',ASSETTRUST_V70_LOCAL_CONFIRM:'YES',NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME};
function role(root){const p=v70.paths(root),o=v70.load({root}),url=new URL(o.env.DATABASE_URL);
 url.username='assettrust_v57_ci_runtime';url.password='test-only-value';
 fs.writeFileSync(p.role,'ASSETTRUST_RUNTIME_DATABASE_URL='+url.toString()+'\n',{mode:0o600});fs.chmodSync(p.role,0o600);
}
function run(root,{mutate,afterStage,roleReady=true,override,...extra}={}){
 if(roleReady)role(root);
 const children=[],stages=[];
 const opts={root,env,buildRunner:()=>({status:0}),
  artifactsReady:()=>true,buildEvidenceReady:()=>provenance.verify(root).ok,
  runner:(program,args)=>{
   children.push([program,...args]);
   if(mutate)mutate({root,stages,children,program,args});
   return {status:0,stdout:'CREDENTIAL=NEVER_LOG_THIS',stderr:'postgres://private:secret@127.0.0.1/assettrust_test'};
  },
  v70Run:(kind,{runner})=>{
   stages.push(kind);
   // Two distinct child invocations in each synthetic stage, to detect drift
   // before the next real child would have launched.
   for(let i=0;i<2;i++){
    if(runner('npm',['run',`synthetic-${kind}-${i}`],{}).status!==0)return {status:'FAILED'};
   }
   if(afterStage)afterStage({root,stages,children,kind});
   return {status:'COMMANDS_PASSED_RELEASE_BLOCKED'};
  },...extra};
 const result=kali.execute(opts);
 const dir=path.join(root,'.assettrust-local/v70/evidence');
 const reports=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
 assert.equal(reports.length,1);
 const contents=fs.readFileSync(path.join(dir,reports[0]),'utf8');
 assert.doesNotMatch(contents,/NEVER_LOG_THIS|private:secret|postgres:\/\//);
 return {result,evidence:JSON.parse(contents),stages,children};
}
const mutators={
 'API TypeScript source':r=>put(r,'apps/api/src/main.ts','export const stage = "changed";'),
 'web TSX source':r=>put(r,'apps/web/src/main.tsx','export const stage = "changed";'),
 'SQL migration':r=>put(r,'apps/api/sql/001.sql','DROP TABLE confidential;'),
 'tooling source':r=>put(r,'tools/protect.cjs','// altered'),
 'deployment configuration':r=>put(r,'deploy/Caddyfile','reverse_proxy remote:443'),
 'CI workflow':r=>put(r,'.github/workflows/ci.yml','name: altered'),
 'API compiled entrypoint':r=>put(r,'apps/api/dist/main.js','console.log("compromised")'),
 'API compiled nonentry module':r=>put(r,'apps/api/dist/other.js','module.exports={trusted:false}'),
 'web built JavaScript':r=>put(r,'apps/web/dist/assets/index-Clean.js','console.log("compromised")'),
 'web built CSS':r=>put(r,'apps/web/dist/assets/index-Clean.css','body{display:none}'),
 'npm lockfile':r=>fs.appendFileSync(path.join(r,'package-lock.json'),' '),
 'new compiled file':r=>put(r,'apps/api/dist/unauthorized.js','module.exports={}'),
 'deleted compiled file':r=>fs.unlinkSync(path.join(r,'apps/web/dist/assets/index-Clean.css')),
 'symlinked compiled file':r=>{const p=path.join(r,'apps/api/dist/other.js');fs.unlinkSync(p);fs.symlinkSync(path.join(r,'apps/api/src/main.ts'),p);},
 'build evidence':r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));j.steps[0].passed=false;fs.writeFileSync(f,JSON.stringify(j));},
};
function assertBlocked(out,stage){
 assert.equal(out.result.status,'FAILED');assert.equal(out.result.stage,stage);
 assert.equal(out.evidence.productionApproved,false);
 assert.equal(out.evidence.releaseStatus,'NO_GO');
 assert.equal(out.evidence.continuousBuildIntegrityEnforced,true);
 assert.ok(out.evidence.integrityChecks>=2);
 assert.equal(out.evidence.firstFailure.errorCode,'BUILD_INTEGRITY_DRIFT');
}
test('v87+ enables continuous integrity but v86 historical fixture remains opt-out',()=>{
 withFixture(root=>{
  assert.equal(kali.requiresContinuousIntegrity(root),true);
  put(root,'package.json',JSON.stringify({version:'0.86.0'}));
  assert.equal(kali.requiresContinuousIntegrity(root),false);
 });
});
test('unmodified synthetic build can complete all seven acceptance stages, never release approved',()=>withFixture(root=>{
 const o=run(root);
 assert.equal(o.result.status,'ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED');
 assert.equal(o.evidence.steps.length,7);assert.equal(o.evidence.releaseStatus,'NO_GO');
 assert.equal(o.evidence.continuousBuildIntegrityEnforced,true);
 assert.ok(o.evidence.integrityChecks>=26);
 assert.deepEqual(o.stages,['--start','--start-scanner','--migrate','--verify','--run-http']);
 assert.equal(o.children.length,10);
}));
test('new runtime role remains in ordered stage and provenance is checked',()=>withFixture(root=>{
 const o=run(root,{roleReady:false});
 assert.equal(o.result.status,'ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED');
 assert.deepEqual(o.stages,['--start','--start-scanner','--migrate','--provision','--verify','--run-http']);
 assert.equal(o.evidence.steps.length,7);
}));
for(const [name,mutator] of Object.entries(mutators)){
 test(`source or artifact change DURING first live command blocks before second: ${name}`,()=>withFixture(root=>{
  let changed=false;
  const o=run(root,{mutate:({root,children})=>{if(!changed&&children.length===1){mutator(root);changed=true;}}});
  assertBlocked(o,'isolated-postgis');assert.equal(o.children.length,1);
  assert.equal(o.stages.length,1);
 }));
}
for(const stageId of ['--start','--start-scanner','--migrate','--verify']){
 test(`drift at end of ${stageId} is caught before next stage`,()=>withFixture(root=>{
  const o=run(root,{afterStage:({root,kind})=>{if(kind===stageId)mutators['API TypeScript source'](root);}});
  const names={'--start':'isolated-postgis','--start-scanner':'local-clamav','--migrate':'migration-and-ledger','--verify':'live-security-verification'};
  assertBlocked(o,names[stageId]);
  assert.equal(o.stages[o.stages.length-1],stageId);
 }));
}
test('drift at end of final authenticated HTTP stage never reports success',()=>withFixture(root=>{
 const o=run(root,{afterStage:({root,kind})=>{if(kind==='--run-http')mutators['web built JavaScript'](root);}});
 assertBlocked(o,'authenticated-http-acceptance');
 assert.equal(o.stages.length,5);
}));
test('read-only provenance reviewer refusing mid-sequence blocks without running next command',()=>withFixture(root=>{
 let checks=0;
 const o=run(root,{buildEvidenceReady:()=>{checks++;return checks<=4;}});
 assert.equal(o.result.status,'FAILED');assert.equal(o.result.stage,'isolated-postgis');
 assert.equal(o.children.length,1);assert.equal(o.evidence.firstFailure.errorCode,'BUILD_INTEGRITY_DRIFT');
}));
test('exception from read-only reviewer stops live execution without spilling exception content',()=>withFixture(root=>{
 let checks=0;
 const o=run(root,{buildEvidenceReady:()=>{checks++;if(checks===4)throw Error('PASSWORD=very_private');return true;}});
 assert.equal(o.result.status,'FAILED');assert.equal(o.result.stage,'isolated-postgis');
 assert.equal(o.evidence.firstFailure.errorCode,'BUILD_INTEGRITY_DRIFT');
}));
test('drift on entry to real HTTP stage blocks before HTTP child executes',()=>withFixture(root=>{
 const o=run(root,{mutate:({root,stages,children})=>{if(stages.includes('--verify')&&children.length===7)mutators['web TSX source'](root);}});
 assert.equal(o.result.status,'FAILED');assert.equal(o.evidence.productionApproved,false);
 assert.ok(o.stages.length<5);
}));
test('v87 entry points and CI include new regression before live testing and final post-live attestation',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 assert.equal(pkg.version,'0.87.0');
 for(const f of ['apps/api/package.json','apps/web/package.json'])assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT,f))).version,'0.87.0');
 for(const s of ['verify:v87','kali:acceptance:plan:v87','kali:acceptance:inspect:v87','kali:acceptance:run:v87'])assert.ok(pkg.scripts[s]);
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 assert.match(ci,/npm run verify:v87/);
 assert.ok(ci.indexOf('npm run verify:v87')<ci.indexOf('npm run build\n'));
 const pos=ci.lastIndexOf('npm run acceptance:provenance:inspect:v86');
 assert.ok(pos>ci.indexOf('npm run test:pg:documents-rls:v50'));
 const source=fs.readFileSync(path.join(ROOT,'tools/kali-acceptance-v71.cjs'),'utf8');
 assert.match(source,/BUILD_INTEGRITY_DRIFT/);
});
test('v87 plan/read-only inspection do not start a live operation or approve release',()=>{
 const r=kali.plan();assert.equal(r.productionApproved,false);assert.equal(r.status,'NOT_EXECUTED');
 assert.equal(r.stages.length,7);
 assert.equal(r.continuousBuildIntegrityEnforced,true);
 assert.equal(kali.requiresContinuousIntegrity(ROOT),true);
});
test('source scanner proof never contains artificial credentials from a failed child',()=>withFixture(root=>{
 const o=run(root,{runner:()=>({status:1,stdout:'DATABASE_URL=supersecret',stderr:'Bearer tok'})});
 assert.equal(o.result.status,'FAILED');assert.equal(o.evidence.credentialsIncluded,false);
 assert.equal(o.evidence.logsIncluded,false);
}));
test('v87 read-only inspection reflects actual build evidence without approving production',()=>{
 const i=kali.inspect({root:ROOT});
 assert.equal(i.continuousBuildIntegrityEnforced,true);
 assert.equal(i.compiledProvenanceReady,provenance.verify(ROOT).ok);
 assert.equal(i.productionApproved,false);
});
