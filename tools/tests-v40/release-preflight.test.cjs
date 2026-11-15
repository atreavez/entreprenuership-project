'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inspect}=require('../release-readiness-v40.cjs');
test('read-only readiness preflight cannot claim production approval even with local tool checks',()=>{
 const p=inspect();assert.equal(p.schema,'ASSETTRUST_RELEASE_PREFLIGHT_V40');assert.equal(p.readyForRelease,false);
 const migration=p.checks.find(x=>x.id==='source-migration-fingerprints');assert.equal(migration.pass,true);

 assert(p.unverified.some(x=>/PostgreSQL/.test(x)));
});
test('preflight does not create or change files when inspecting an incomplete source tree',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v40-preflight-'));
 try{const before=fs.readdirSync(dir);const report=inspect(dir);assert.equal(report.readyForRelease,false);assert.equal(report.checks.find(x=>x.id==='source-migration-fingerprints').pass,false);assert.deepEqual(fs.readdirSync(dir),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('lockfile presence is detected without granting release approval',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v40-lockfile-'));
 try{
  const absent=inspect(dir);
  assert.equal(absent.checks.find(x=>x.id==='lockfile-present').pass,false);
  assert.equal(absent.readyForRelease,false);

  // Minimal structural fixture, not a usable dependency lockfile.
  fs.writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify({
   lockfileVersion:3,packages:{}
  }));
  const present=inspect(dir);
  assert.equal(present.checks.find(x=>x.id==='lockfile-present').pass,true);
  assert.equal(present.readyForRelease,false);
  assert(present.unverified.some(x=>/PostgreSQL/.test(x)));
 }finally{
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
