'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const release=require('../release-validation-v51.cjs');
test('supervised database validation orders anchoring after restricted tenant CRUD',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const names=release.dbSteps(pkg).map(x=>x.name);
 assert(names.indexOf('test:pg:anchoring:v87')>names.indexOf('test:pg:runtime-tenant-crud:v59'));
 assert(names.indexOf('test:pg:anchoring:v87')<names.indexOf('two-real-api-instances'));
});
test('database release supervisor cannot omit explicit anchoring test consent',()=>{
 const source=fs.readFileSync(path.join(root,'tools/release-validation-v51.cjs'),'utf8');
 assert(source.includes("env.ASSETTRUST_V87_ANCHOR_PG_CONFIRM!=='YES'"));
 assert(source.includes('ANCHORING_ACCEPTANCE_SCRIPT_REQUIRED'));
 assert(source.indexOf('if(!target.ok)return output;')<source.indexOf('runner(step.bin'));
});
