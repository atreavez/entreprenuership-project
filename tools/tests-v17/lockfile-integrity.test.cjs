'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {inspectDependencyGraph}=require('../lockfile-integrity-v17.cjs');
const integrity='sha512-'+Buffer.alloc(64,1).toString('base64');
function fixture(run){
 const dir=mkdtempSync(join(tmpdir(),'assettrust-lock-v17-'));
 try{
  for(const name of ['apps/api','apps/web'])mkdirSync(join(dir,name),{recursive:true});
  const manifests={
   '':{name:'assettrust-platform',version:'0.17.0',workspaces:['apps/api','apps/web']},
   'apps/api':{name:'@assettrust/api',version:'0.17.0',dependencies:{'@nestjs/common':'^11.1.0'}},
   'apps/web':{name:'@assettrust/web',version:'0.17.0',dependencies:{react:'^19.2.0'}}
  };
  const lock={name:'assettrust-platform',version:'0.17.0',lockfileVersion:3,packages:{
   '':structuredClone(manifests['']),'apps/api':structuredClone(manifests['apps/api']),'apps/web':structuredClone(manifests['apps/web']),
   'node_modules/@assettrust/api':{resolved:'apps/api',link:true},
   'node_modules/@assettrust/web':{resolved:'apps/web',link:true},
   'node_modules/@nestjs/common':{version:'11.1.8',resolved:'https://registry.npmjs.org/@nestjs/common/-/common-11.1.8.tgz',integrity},
   'node_modules/react':{version:'19.2.0',resolved:'https://registry.npmjs.org/react/-/react-19.2.0.tgz',integrity}
  }};
  const save=()=>{for(const [p,m] of Object.entries(manifests))writeFileSync(join(dir,p,'package.json'),JSON.stringify(m));writeFileSync(join(dir,'package-lock.json'),JSON.stringify(lock));};
  save();return run({dir,manifests,lock,save});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
function violations(dir){return inspectDependencyGraph(dir).failures.join('\n')}
test('a complete workspace lock passes structural integrity checks',()=>fixture(({dir})=>assert.deepEqual(inspectDependencyGraph(dir).failures,[])));
test('superficial stub lockfile is rejected even when all workspace names exist',()=>fixture(({dir,lock,save})=>{delete lock.packages['node_modules/react'];save();assert.match(violations(dir),/react/)}));
test('stale package range is rejected',()=>fixture(({dir,manifests,save})=>{manifests['apps/web'].dependencies.react='^20.0.0';save();assert.match(violations(dir),/mismatch/)}));
test('dependency entries without trustworthy integrity hashes are rejected',()=>fixture(({dir,lock,save})=>{delete lock.packages['node_modules/react'].integrity;save();assert.match(violations(dir),/[Ii]ntegrity/)}));
test('workspace links cannot point elsewhere',()=>fixture(({dir,lock,save})=>{lock.packages['node_modules/@assettrust/web'].resolved='apps/api';save();assert.match(violations(dir),/link/)}));
test('version drift between manifest and lock is rejected',()=>fixture(({dir,lock,save})=>{lock.packages['apps/api'].version='0.15.0';save();assert.match(violations(dir),/version/)}));
test('a lock without a root workspace declaration is rejected',()=>fixture(({dir,lock,save})=>{delete lock.packages[''].workspaces;save();assert.match(violations(dir),/workspaces/)}));
test('a release is rejected without a lockfile',()=>fixture(({dir})=>{require('node:fs').unlinkSync(join(dir,'package-lock.json'));assert.match(violations(dir),/package-lock/)}));

test('missing transitive dependency is rejected',()=>fixture(({dir,lock,save})=>{lock.packages['node_modules/react'].dependencies={'loose-envify':'^1.4.0'};save();assert.match(violations(dir),/transitive dependency/)}));

test('malformed or truncated integrity hashes are rejected',()=>fixture(({dir,lock,save})=>{lock.packages['node_modules/react'].integrity='sha512-Z';save();assert.match(violations(dir),/[Ii]ntegrity/)}));
