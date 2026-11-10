"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');const os=require('node:os');const path=require('node:path');
const {inspectRelease}=require('../release-gate-policy-v16.cjs');
function sandbox(fn){const root=mkdtempSync(path.join(os.tmpdir(),'assettrust-release-'));try{for(const d of ['apps/api','apps/web','.github/workflows'])mkdirSync(path.join(root,d),{recursive:true});
writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'assettrust-platform',workspaces:['apps/api','apps/web']}));
writeFileSync(path.join(root,'apps/api/package.json'),'{}');writeFileSync(path.join(root,'apps/web/package.json'),'{}');
writeFileSync(path.join(root,'.github/workflows/ci.yml'),'run: |\n  npm ci\n  npm run build\n  npm run db:migrate\n  npm run db:check\n  node tools/ci-live-integration.mjs');
return fn(root);}finally{rmSync(root,{recursive:true,force:true});}}
function lock(root){writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({name:'assettrust-platform',lockfileVersion:3,packages:{'':{name:'assettrust-platform'},'apps/api':{},'apps/web':{}}}));}
test('RED gate: missing lockfile blocks release',()=>sandbox(root=>assert.match(inspectRelease(root).failures.join(' '),/Missing reviewed package-lock/)));
test('GREEN gate: valid lockfile and CI requirements pass',()=>sandbox(root=>{lock(root);assert.equal(inspectRelease(root).ok,true)}));
test('wrong root package blocks release',()=>sandbox(root=>{lock(root);writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'different'}));assert.equal(inspectRelease(root).ok,false)}));
test('missing workspace blocks release',()=>sandbox(root=>{writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{'':{name:'assettrust-platform'},'apps/api':{}}}));assert.match(inspectRelease(root).failures.join(' '),/apps\/web/)}));
test('CI npm install cannot substitute npm ci',()=>sandbox(root=>{lock(root);writeFileSync(path.join(root,'.github/workflows/ci.yml'),'npm install\nnpm run build\ndb:migrate\ndb:check\nci-live-integration');assert.equal(inspectRelease(root).ok,false)}));
test('CI missing supervised live tests blocks release',()=>sandbox(root=>{lock(root);writeFileSync(path.join(root,'.github/workflows/ci.yml'),'npm ci\nnpm run build\ndb:migrate\ndb:check');assert.equal(inspectRelease(root).ok,false)}));
