'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {verify}=require('../validation-evidence-v53.cjs');
const {plan}=require('../release-validation-v51.cjs');
const ROOT=path.resolve(__dirname,'../..');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v53-evidence-'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'test',version:'0.53.0',scripts:{'verify:v03':'node -v','test:pg:sample:v53':'node -v','security:clamav:v52':'node -v'}}));
 const expected=plan(dir);
 const stages=[...expected.build,...expected.database].map(s=>({name:s.name,ok:true,exitCode:0,durationMs:1}));
 const sample={schema:'ASSETTRUST_V51_SUPERVISED_VALIDATION',mode:'--full',sourceVersion:'0.53.0',productionApproved:false,status:'VALIDATION_STEPS_PASSED_NOT_RELEASE_APPROVAL',steps:stages};
 const outfile=path.join(dir,'test-evidence/v51/local-validation-summary.json');fs.mkdirSync(path.dirname(outfile),{recursive:true});
 const write=obj=>fs.writeFileSync(outfile,JSON.stringify(obj),{mode:0o600});
 try{return fn({dir,sample,write,check:()=>verify(dir,{requireGit:false,checkLockfile:false})})}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('current snapshot remains an explicit NO-GO and never claims production readiness',()=>{
 const result=verify(ROOT);
 assert.equal(result.ok,false);assert.equal(result.productionApproved,false);
 assert(result.issues.some(s=>/lockfile/.test(s)));assert(result.issues.some(s=>/Git/.test(s)));
 assert(result.stagesRequired>75);
});
test('synthetic full report with exact ordered stages is accepted for completeness ONLY',()=>fixture(({sample,write,check})=>{
 write(sample);const result=check();assert.equal(result.ok,true,result.issues.join('; '));assert.equal(result.productionApproved,false);
}));
test('missing one stage is rejected even with a misleading success label',()=>fixture(({sample,write,check})=>{
 sample.steps.splice(2,1);write(sample);
 const result=check();assert(!result.ok);assert(result.issues.some(s=>/Incomplete/.test(s)));
}));
test('reordered stages, duplicate stages and fabricated exit status are rejected',()=>fixture(({sample,write,check})=>{
 [sample.steps[2],sample.steps[3]]=[sample.steps[3],sample.steps[2]];write(sample);
 assert(!check().ok);
 sample.steps[2].exitCode=1;write(sample);assert(!check().ok);
}));
test('a build-only or database-only report cannot be presented as full validation',()=>fixture(({sample,write,check})=>{
 sample.mode='--validate';write(sample);assert(check().issues.some(s=>/--full/.test(s)));
 sample.mode='--database';write(sample);assert(!check().ok);
}));
test('version mismatch, nonzero exit, and invalid durations are rejected',()=>fixture(({sample,write,check})=>{
 sample.sourceVersion='0.52.0';write(sample);assert(!check().ok);
 sample.sourceVersion='0.53.0';sample.steps[0].durationMs=-1;write(sample);assert(!check().ok);
 sample.steps[0].durationMs=1;sample.steps[0].exitCode=null;write(sample);assert(!check().ok);
}));
test('evidence owned by the current user must be private and not a symlink',()=>fixture(({dir,sample,write,check})=>{
 write(sample);const file=path.join(dir,'test-evidence/v51/local-validation-summary.json');
 fs.chmodSync(file,0o644);assert(!check().ok);
 fs.chmodSync(file,0o600);assert(check().ok);
 fs.unlinkSync(file);
 const other=path.join(dir,'other.json');fs.writeFileSync(other,JSON.stringify(sample));fs.symlinkSync(other,file);
 assert(!check().ok);
}));
test('evidence checker is read-only: no artifacts are created by review',()=>fixture(({dir,check})=>{
 const before=fs.readdirSync(dir);const result=check();assert(!result.ok);assert.deepEqual(fs.readdirSync(dir),before);
}));
