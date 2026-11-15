'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const build=require('../build-acceptance-v68.cjs');
const review=require('../acceptance-provenance-v86.cjs');
const kali=require('../kali-acceptance-v71.cjs');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const outputHTML='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module" src="/assets/index-Clean.js"></script></body></html>';
function put(root,name,contents){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);return file;}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v86-'));
 const m={name:'assettrust-platform',version:'0.86.0',scripts:{'verify:v86':'node --test --test-concurrency=1 tools/tests-v86/*.test.cjs'}};
 put(root,'package.json',JSON.stringify(m));
 for(const [folder,name] of [['apps/api','@assettrust/api'],['apps/web','@assettrust/web']])put(root,`${folder}/package.json`,JSON.stringify({name,version:'0.86.0'}));
 put(root,'package-lock.json','synthetic test lockfile (not a real dependency lockfile)');
 put(root,'apps/api/src/main.ts','export const healthy = true;');
 put(root,'apps/api/sql/001_initial.sql','SELECT 1;');
 put(root,'apps/api/tsconfig.json','{}');
 put(root,'apps/web/src/main.tsx','export const root = true;');
 put(root,'apps/web/index.html','<!doctype html><div id="root"></div>');
 put(root,'apps/web/tsconfig.json','{}');
 put(root,'apps/web/vite.config.ts','export default {}');
 put(root,'tools/migration-run.cjs','// fixture migration runner');
 put(root,'services/tiles.py','# fixture');
 put(root,'deploy/Caddyfile','# fixture');
 put(root,'.github/workflows/ci.yml','# fixture');
 return root;
}
function clean(root){fs.rmSync(root,{force:true,recursive:true});}
function emit(root){
 put(root,'apps/api/dist/main.js','"use strict"; console.log("healthy API")');
 put(root,'apps/api/dist/contexts/private-domain.js','module.exports={ok:true}');
 put(root,'apps/web/dist/index.html',outputHTML);
 put(root,'apps/web/dist/assets/index-Clean.js','console.log("safe web")');
 put(root,'apps/web/dist/assets/index-Clean.css','body{margin:0}');
}
function builtFixture(){
 const root=fixture();
 let calls=[];
 const result=build.runAcceptance({root,
  env:{ASSETTRUST_V68_BUILD_CONFIRM:'YES',NODE_ENV:'test'},
  detectFn:()=>({ok:true,version:'0.86.0'}),
  runner:(command,args,options)=>{
   assert.equal(command,'npm');assert.equal(options.shell,false);calls.push(args.join(' '));
   if(args.join(' ')==='run build')emit(root);
   return {status:0,stdout:'',stderr:''};
  }});
 assert.equal(result.status,'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED',JSON.stringify(result.issues));
 put(root,'test-evidence/v68/build-acceptance.json',JSON.stringify(result));
 assert.equal(calls.length,7);
 return {root,result};
}
function scenario(label,mutate,expectedCode){test(label,()=>{
 const {root}=builtFixture();try{
  mutate(root);
  const r=review.verify(root);
  assert.equal(r.ok,false,label+' should refuse stale evidence');
  assert.ok(r.issues.includes(expectedCode),JSON.stringify(r.issues));
  assert.equal(kali.reviewBuildEvidence(root),false);
  assert.equal(r.productionApproved,false);
 }finally{clean(root);}
});}
test('complete recorded build including full source and output snapshots is accepted for disposable testing, not production',()=>{
 const {root,result}=builtFixture();try{
  assert.match(result.sourceSnapshotSha256,/^[a-f\d]{64}$/);
  assert.match(result.compiledOutputSnapshotSha256,/^[a-f\d]{64}$/);
  assert.equal(result.compiledOutputSnapshotFileCount,5);
  const out=review.verify(root);
  assert.equal(out.ok,true,JSON.stringify(out.issues));assert.equal(kali.reviewBuildEvidence(root),true);
  assert.equal(out.productionApproved,false);assert.equal(out.liveDatabaseTested,false);
 }finally{clean(root);}
});
scenario('changing backend source after recorded build fails closed',r=>put(r,'apps/api/src/main.ts','export const healthy = false;'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('adding a backend source file after build fails closed',r=>put(r,'apps/api/src/unauthorized.ts','export {}'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('changing frontend source after recorded build fails closed',r=>put(r,'apps/web/src/main.tsx','export const root = false;'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('mutating reviewed SQL after the build fails closed',r=>put(r,'apps/api/sql/001_initial.sql','DROP TABLE IF EXISTS valuable;'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('mutating build tools after recorded build fails closed',r=>put(r,'tools/migration-run.cjs','throw Error("tampered");'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('mutating CI release policies after recorded build fails closed',r=>put(r,'.github/workflows/ci.yml','name: changed'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('mutating deployment files after recorded build fails closed',r=>put(r,'deploy/Caddyfile','reverse_proxy internet:443'),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('manifest tampering invalidates build',r=>fs.appendFileSync(path.join(r,'apps/api/package.json'),' '),'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('reviewed root manifest tampering invalidates build',r=>fs.appendFileSync(path.join(r,'package.json'),' '),'MANIFEST_OR_LOCKFILE_MISMATCH');
scenario('reviewed npm lockfile tampering invalidates build',r=>fs.appendFileSync(path.join(r,'package-lock.json'),' '),'MANIFEST_OR_LOCKFILE_MISMATCH');
scenario('compiled API entry tampering invalidates build',r=>put(r,'apps/api/dist/main.js','console.log("altered")'),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled non-entry API module tampering invalidates build',r=>put(r,'apps/api/dist/contexts/private-domain.js','module.exports={ok:false}'),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled browser entry tampering invalidates build',r=>put(r,'apps/web/dist/index.html',outputHTML+' '),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled JavaScript chunk tampering invalidates build',r=>put(r,'apps/web/dist/assets/index-Clean.js','console.log("new")'),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled CSS chunk tampering invalidates build',r=>put(r,'apps/web/dist/assets/index-Clean.css','body{display:none}'),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled output newly added JavaScript fails closed',r=>put(r,'apps/api/dist/new-code.js','export {}'),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled output removal fails closed',r=>fs.unlinkSync(path.join(r,'apps/web/dist/assets/index-Clean.css')),'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('compiled output symlink fails closed',r=>{fs.unlinkSync(path.join(r,'apps/api/dist/main.js'));fs.symlinkSync(path.join(r,'apps/api/src/main.ts'),path.join(r,'apps/api/dist/main.js'));},'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('replacing archived evidence with symlink fails closed',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');fs.unlinkSync(f);fs.symlinkSync(path.join(r,'package.json'),f);},'BUILD_EVIDENCE_MISSING_OR_INVALID');
scenario('removing archived evidence fails closed',r=>fs.unlinkSync(path.join(r,'test-evidence/v68/build-acceptance.json')),'BUILD_EVIDENCE_MISSING_OR_INVALID');
scenario('removing source snapshot proof cannot reuse older evidence',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));delete j.sourceSnapshotSha256;put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'REVIEWED_SOURCE_CHANGED_OR_UNSAFE');
scenario('removing compiled output snapshot cannot reuse older evidence',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));delete j.compiledOutputSnapshotSha256;put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('altering step order cannot represent a completed supervised build',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));j.steps.reverse();put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'INCOMPLETE_OR_UNORDERED_BUILD_STEPS');
scenario('removing the current version test cannot represent a completed supervised build',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));j.steps.pop();put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'INCOMPLETE_OR_UNORDERED_BUILD_STEPS');
scenario('successful step but nonzero exit code is rejected',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));j.steps[3].exitCode=23;put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'INCOMPLETE_OR_UNORDERED_BUILD_STEPS');
scenario('fake production approval is rejected by verification',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));j.productionApproved=true;put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'UNTRUSTED_BUILD_RESULT');
scenario('missing reviewer-approved artifact policy fails closed',r=>{const f=path.join(r,'test-evidence/v68/build-acceptance.json');const j=JSON.parse(fs.readFileSync(f));j.artifacts.ok=false;put(r,'test-evidence/v68/build-acceptance.json',JSON.stringify(j));},'COMPILED_OUTPUT_CHANGED_OR_INVALID');
scenario('workspace version mismatch fails closed',r=>{const f=path.join(r,'apps/web/package.json');const j=JSON.parse(fs.readFileSync(f));j.version='0.85.0';put(r,'apps/web/package.json',JSON.stringify(j));},'V86_VERSION_OR_WORKSPACE_INVALID');
test('read-only plan does not contain secrets or modify project',()=>{
 const before=hash(path.join(ROOT,'package.json'));const r=review.plan();
 assert.equal(r.mode,'READ_ONLY');assert.equal(r.productionApproved,false);
 assert.equal(hash(path.join(ROOT,'package.json')),before);
 assert.doesNotMatch(JSON.stringify(r),/password=|postgres:|JWT_SECRET/);
});
test('a disposable source snapshot without authentic build evidence is always rejected',()=>{
 const root=fixture();try{
  const r=review.verify(root);assert.equal(r.ok,false);assert.equal(r.productionApproved,false);
  assert.ok(r.issues.some(x=>x==='BUILD_EVIDENCE_MISSING_OR_INVALID'||x==='UNTRUSTED_BUILD_RESULT'||x==='MANIFEST_OR_LOCKFILE_MISMATCH'));
 }finally{clean(root);}
});
test('current milestone scripts and CI cannot silently omit provenance regression',()=>{
 const p=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json')));
 const ci=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 for(const name of ['verify:v86','acceptance:provenance:plan:v86','acceptance:provenance:inspect:v86'])assert.ok(p.scripts[name]);
 assert.match(ci,/npm run verify:v86/);assert.ok(ci.indexOf('npm run verify:v86')<ci.indexOf('npm run build\n'));
 assert.ok(ci.indexOf('npm run build:acceptance:run:v68')>ci.indexOf('npm run build:artifacts:v56'));
 assert.ok(ci.indexOf('npm run acceptance:provenance:inspect:v86')>ci.indexOf('npm run build:acceptance:run:v68'));
 assert.ok(ci.indexOf('npm run acceptance:provenance:inspect:v86')<ci.indexOf('npm run db:migrate --workspace apps/api'));
 assert.match(fs.readFileSync(path.join(ROOT,'tools/kali-acceptance-v71.cjs'),'utf8'),/acceptance-provenance-v86/);
});
test('historical non-v86 builds keep their original regression fixture semantics only',()=>{
 const root=fixture();try{put(root,'package.json',JSON.stringify({version:'0.85.0'}));assert.equal(review.verify(root).ok,false);
 }finally{clean(root);}
});
test('v86 CLI safe plan and inspect reflect the current build evidence, whether present or absent',()=>{
 const cli=spawnSync(process.execPath,['tools/acceptance-provenance-v86.cjs','--plan'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(cli.status,0);assert.equal(JSON.parse(cli.stdout).productionApproved,false);
 const check=spawnSync(process.execPath,['tools/acceptance-provenance-v86.cjs','--inspect'],{cwd:ROOT,encoding:'utf8'});
 const inspected=JSON.parse(check.stdout);
 assert.equal(check.status,inspected.ok?0:1);
 assert.equal(inspected.ok,review.verify(ROOT).ok);
 assert.equal(inspected.productionApproved,false);
});
