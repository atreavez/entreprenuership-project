'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
test('live anchoring test rejects unapproved execution before loading pg',()=>{
 const r=spawnSync(process.execPath,['tools/e2e-pg-anchoring-v87.mjs'],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
 assert.notEqual(r.status,0);assert.match(r.stderr,/BLOCKED: supervised disposable anchoring test required/);
});
test('real anchoring acceptance is registered in CI after migration and runtime role setup',()=>{
 const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
 assert(ci.indexOf('npm run test:pg:anchoring:v87')>ci.indexOf('npm run test:pg:runtime-tenant-crud:v59'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts['test:pg:anchoring:v87'],'node tools/e2e-pg-anchoring-v87.mjs');
});
