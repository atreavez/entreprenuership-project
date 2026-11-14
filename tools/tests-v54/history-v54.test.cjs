'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {scanGitHistory,scanWorkingTree}=require('../secret-scan-v43.cjs');
const {scanGitHistoryBatched,LIMITS}=require('../git-history-batch-v54.cjs');
const {matches}=require('../secret-scan-v43.cjs');

function git(root,...args){
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,`${args.join(' ')}: ${result.stderr}`);
 return result.stdout.trim();
}
function sandbox(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v54-git-'));
 try{
  git(root,'init','-q');git(root,'config','user.name','Test Repo');git(root,'config','user.email','example@invalid.test');
  fs.writeFileSync(path.join(root,'README.md'),'No secrets here\n');
  git(root,'add','.');git(root,'commit','-qm','clean initial commit');
  return fn(root);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
function fakeSecret(){return 'ghp_'+'A'.repeat(30);}

test('the real Git object scanner passes benign committed history',()=>sandbox(root=>{
 const result=scanGitHistory(root);
 assert.equal(result.complete,true,result.reason);
 assert.equal(result.issues.length,0);
 assert(result.objects>=2);
 assert(result.scannedBytes>0);
 assert.match(result.scope,/reflogs/);
}));
test('a secret deleted from the working tree is still found in reachable Git history without exposure',()=>sandbox(root=>{
 const secret=fakeSecret();
 fs.writeFileSync(path.join(root,'sample.txt'),`one-time: ${secret}\n`);
 git(root,'add','.');git(root,'commit','-qm','add config');
 fs.rmSync(path.join(root,'sample.txt'));
 git(root,'add','-u');git(root,'commit','-qm','remove credential');
 const clean=scanWorkingTree(root);assert.equal(clean.issues.length,0);
 const history=scanGitHistory(root);
 assert.equal(history.complete,true,history.reason);
 assert(history.issues.some(issue=>issue.type==='GITHUB_TOKEN'));
 assert(!JSON.stringify(history).includes(secret));
}));
test('reflog-only removed commits are inspected, not just --all branch tips',()=>sandbox(root=>{
 fs.writeFileSync(path.join(root,'discarded.txt'),`value: ${fakeSecret()}\n`);
 git(root,'add','.');git(root,'commit','-qm','temporary credential');
 git(root,'reset','--hard','HEAD~1');
 const history=scanGitHistory(root);
 assert.equal(history.complete,true,history.reason);
 assert(history.issues.some(issue=>issue.type==='GITHUB_TOKEN'));
}));
test('Git commit-message credentials are inspected without revealing their value',()=>sandbox(root=>{
 git(root,'commit','--allow-empty','-qm',`incorrect token was ${fakeSecret()}`);
 const result=scanGitHistory(root);
 assert(result.issues.some(i=>i.type==='GITHUB_TOKEN'));
 assert(!JSON.stringify(result).includes(fakeSecret()));
}));
test('historically committed sensitive filenames are flagged even after removal',()=>sandbox(root=>{
 fs.writeFileSync(path.join(root,'.env.production'),'PLACEHOLDER=not-secret\n');
 git(root,'add','-f','.env.production');git(root,'commit','-qm','config');
 fs.unlinkSync(path.join(root,'.env.production'));git(root,'add','-u');git(root,'commit','-qm','remove');
 assert(scanGitHistory(root).issues.some(i=>i.type==='SENSITIVE_FILENAME'));
}));
test('oversized historical data yields a review-required finding instead of being silently skipped',()=>sandbox(root=>{
 fs.writeFileSync(path.join(root,'large.log'),Buffer.alloc(LIMITS.maxObjectBytes+1,0x41));
 git(root,'add','.');git(root,'commit','-qm','oversized historical file');
 const result=scanGitHistory(root);
 assert.equal(result.complete,true,result.reason);
 assert(result.issues.some(i=>i.type==='LARGE_OBJECT_REVIEW_REQUIRED'));
}));
test('a shallow clone cannot claim full history',()=>sandbox(root=>{
 const other=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v54-shallow-'));
 try{
  git(root,'commit','--allow-empty','-qm','later commit');
  git(other,'clone','-q','--depth=1',`file://${root}`,'copy');
  const result=scanGitHistory(path.join(other,'copy'));
  assert.equal(result.complete,false);
  assert.match(result.reason,/shallow/i);
 }finally{fs.rmSync(other,{recursive:true,force:true});}
}));
test('a source ZIP without .git cannot claim historical secrets were reviewed',()=>{
 const other=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v54-nogit-'));
 try{const result=scanGitHistory(other);assert.equal(result.complete,false);assert.match(result.reason,/No .git/);}
 finally{fs.rmSync(other,{recursive:true,force:true});}
});
test('byte or object budget exhaustion fails closed',()=>sandbox(root=>{
 const result=scanGitHistoryBatched(root,matches,{...LIMITS,maxTotalBytes:1});
 assert.equal(result.complete,false);
 assert.match(result.reason,/budget/i);
 const result2=scanGitHistoryBatched(root,matches,{...LIMITS,maxObjects:1});
 assert.equal(result2.complete,false);
 assert.match(result2.reason,/limit/i);
}));
test('many historical objects are batched and checked without per-object process calls',()=>sandbox(root=>{
 for(let i=0;i<120;i++)fs.writeFileSync(path.join(root,`item${i}.txt`),`plain ${i}\n`);
 git(root,'add','.');git(root,'commit','-qm','bulk files');
 const result=scanGitHistory(root);
 assert.equal(result.complete,true,result.reason);
 assert.equal(result.issues.length,0);
 assert(result.objects>=120);
}));
test('CLI can explicitly audit the original repository instead of a source ZIP',()=>sandbox(root=>{
 const scanner=path.resolve(__dirname,'../secret-scan-v43.cjs');
 const outcome=spawnSync(process.execPath,[scanner,'--history','--repo',root],{encoding:'utf8',timeout:30000});
 assert.equal(outcome.status,0,outcome.stdout.slice(0,600));
 const report=JSON.parse(outcome.stdout);
 assert.equal(report.passed,true);
 assert.equal(report.history.complete,true);
}));
test('CLI detects historical token through --repo without printing secret bytes',()=>sandbox(root=>{
 const secret=fakeSecret();
 fs.writeFileSync(path.join(root,'temporary.txt'),`token=${secret}\n`);
 git(root,'add','.');git(root,'commit','-qm','contains temporary secret');
 fs.unlinkSync(path.join(root,'temporary.txt'));git(root,'add','-u');git(root,'commit','-qm','removed token');
 const scanner=path.resolve(__dirname,'../secret-scan-v43.cjs');
 const outcome=spawnSync(process.execPath,[scanner,'--history','--repo',root],{encoding:'utf8',timeout:30000});
 assert.equal(outcome.status,1);
 const report=JSON.parse(outcome.stdout);
 assert.equal(report.passed,false);
 assert(report.history.issues.some(issue=>issue.type==='GITHUB_TOKEN'));
 assert(!outcome.stdout.includes(secret));
}));
test('CLI refuses duplicate or unsupported target arguments rather than silently scanning wrong root',()=>{
 const scanner=path.resolve(__dirname,'../secret-scan-v43.cjs');
 for(const args of [['--history','--history'],['--repo'],['--anything']]){
  const outcome=spawnSync(process.execPath,[scanner,...args],{encoding:'utf8',timeout:30000});
  assert.equal(outcome.status,1);
  assert.match(outcome.stderr,/BLOCKED:/);
 }
});
test('CI and supervised release plan use the batched Git scanner and include v0.54 tests',()=>{
 const ROOT=path.resolve(__dirname,'../..');
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
 const yaml=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 assert.match(manifest.version,/^0\.(?:5[4-9]|[6-9]\d)\.0$/);
 assert.equal(manifest.scripts['security:scan:v54'],'node tools/secret-scan-v43.cjs --history');
 assert.match(yaml,/npm run security:scan:v54/);
 assert.match(yaml,/npm run verify:v54/);
 const {buildSteps}=require('../release-validation-v51.cjs');
 assert(buildSteps(manifest).some(item=>item.name==='full-git-history-secret-scan'));
 const {spawnSync}=require('node:child_process');
 const check=spawnSync('ruby',['tools/workflow-policy-v53.rb'],{cwd:ROOT,encoding:'utf8',timeout:30000});
 assert.equal(check.status,0,check.stdout);
});
test('workflow policy rejects omitting the new history scan',()=>{
 const ROOT=path.resolve(__dirname,'../..');
 const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 const modified=workflow.replace('          npm run security:scan:v54\n','');
 assert.notEqual(modified,workflow);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v54-ci-'));
 try{
  const file=path.join(folder,'ci.yml');fs.writeFileSync(file,modified);
  const validator=path.join(ROOT,'tools/workflow-policy-v53.rb');
  const check=spawnSync('ruby',[validator,file],{cwd:ROOT,encoding:'utf8',timeout:30000});
  assert.equal(check.status,1);
  const report=JSON.parse(check.stdout);
  assert(report.issues.some(issue=>/batched whole-history/i.test(issue)));
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
