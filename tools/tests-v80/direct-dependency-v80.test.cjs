'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const policy=require('../direct-dependency-policy-v80.cjs');
const ROOT=path.resolve(__dirname,'../..');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-deps-v80-'));
 try{
  for(const workspace of ['api','web']){
   const app=path.join(dir,'apps',workspace);fs.mkdirSync(path.join(app,'src'),{recursive:true});
   fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({dependencies:{react:'^19',express:'^5'},devDependencies:{vite:'^8'}}));
  }
  fs.writeFileSync(path.join(dir,'apps/web/vite.config.ts'),"import { defineConfig } from 'vite';");
  return fn(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function alter(root,workspace,text,filename='source.ts'){
 const file=path.join(root,'apps',workspace,'src',filename);fs.writeFileSync(file,text);return file;
}
test('current AssetTrust source declares every imported direct package',()=>{
 const result=policy.check(ROOT);assert.equal(result.ok,true,result.issues.join('\n'));assert(result.sourceImportsInspected>100);
 assert(result.directPackages.includes('api:express'));
 assert(result.directPackages.includes('web:maplibre-gl'));
 assert.equal(result.productionApproved,false);
});
test('Express is a direct API runtime dependency and not supplied only transitively',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'apps/api/package.json'),'utf8'));
 assert.match(pkg.dependencies.express,/^\^5\./);
 assert(!Object.hasOwn(pkg.devDependencies,'express'));
 for(const file of ['src/auth.ts','src/documents.ts','src/contexts/identity/infrastructure/password-reset.module.ts']){
  assert.match(fs.readFileSync(path.join(ROOT,'apps/api',file),'utf8'),/import type \{[^}]+\} from 'express'/);
 }
});
test('all workspace package versions share a milestone at least v0.80',()=>{
 for(const file of ['package.json','apps/api/package.json','apps/web/package.json']){
  const version=JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8')).version;assert.match(version,/^0\.\d+\.0$/);assert(Number(version.split('.')[1])>=80);
 }
});
test('declared fixture runtime imports pass including built-ins and relative paths',()=>fixture(root=>{
 alter(root,'api',"import type { Request } from 'express';\nimport foo from 'node:crypto';\nimport bar from './relative';");
 alter(root,'web',"import React from 'react';\nexport {x} from './local';");
 assert.equal(policy.check(root).ok,true);
}));
test('a missing API dependency is detected with its workspace and source path',()=>fixture(root=>{
 alter(root,'api',"import secret from 'left-pad';");const result=policy.check(root);
 assert.equal(result.ok,false);assert(result.issues.some(x=>x.includes('UNDECLARED_DIRECT_IMPORT:api:')&&x.endsWith(':left-pad')));
}));
test('transitive-only runtime imports fail even if a different workspace declares them',()=>fixture(root=>{
 const api=path.join(root,'apps/api/package.json');const pkg=JSON.parse(fs.readFileSync(api,'utf8'));
 delete pkg.dependencies.react;pkg.devDependencies.react='^19';fs.writeFileSync(api,JSON.stringify(pkg));
 alter(root,'api',"import {useState} from 'react';");
 assert(policy.check(root).issues.some(x=>x.endsWith(':react')));
}));
test('a type-only import cannot silently bypass declaration review',()=>fixture(root=>{
 alter(root,'api',"import type {AuditRecord} from 'unreviewed-customer-sdk';");
 assert(policy.check(root).issues.some(x=>x.endsWith(':unreviewed-customer-sdk')));
}));
test('scoped packages are checked by scope and package name, not a nested entrypoint',()=>fixture(root=>{
 alter(root,'web',"import {Thing} from '@vendor/widget/subpath';");
 const result=policy.check(root);assert(result.issues.some(x=>x.endsWith(':@vendor/widget')));
}));
test('configuration-only devDependencies are accepted, not runtime source imports',()=>fixture(root=>{
 assert.equal(policy.check(root).ok,true);
 alter(root,'web',"import {defineConfig} from 'vite';");
 assert(policy.check(root).issues.some(x=>x.endsWith(':vite')));
}));
test('static multiline import/export and side-effect imports are recognized',()=>{
 const imports=policy.moduleSpecifiers("import {\n  Some,\n  Other\n} from '@vendor/alpha';\nexport {Thing} from 'pkg/submodule';\nimport 'reflect-metadata';\n");
 assert.deepEqual(imports,['@vendor/alpha','pkg/submodule','reflect-metadata']);
});
test('literal import() and require() are recognized',()=>{
 const imports=policy.moduleSpecifiers("const r=import('@vendor/runtime'); const x = require('crypto');");
 assert.deepEqual(imports,['@vendor/runtime','crypto']);
});
test('comments and JSX text do not create package dependencies',()=>fixture(root=>{
 alter(root,'web',"// import Bad from 'fake-lib';\nexport const Example = () => <p>import from 'fake-lib'</p>;",'thing.tsx');
 assert.equal(policy.check(root).ok,true);
}));
test('builtin modules and relative imports are excluded',()=>{
 for(const name of ['./x','../y','node:crypto','fs','fs/promises','#imports'])assert.equal(policy.packageName(name),null);
 assert.equal(policy.packageName('@scope/pkg/subpath'),'@scope/pkg');
 assert.equal(policy.packageName('react/jsx-runtime'),'react');
});
test('symlinked source file fails closed rather than reading outside a fixture',()=>fixture(root=>{
 const f=path.join(root,'apps/api/src/payload.ts');fs.symlinkSync('/etc/hosts',f);
 const result=policy.check(root);assert.equal(result.ok,false);
 assert(result.issues.some(x=>x.includes('INVALID_OR_MISSING_WORKSPACE:api')));
}));
test('symlinked source subtree fails closed',()=>fixture(root=>{
 fs.symlinkSync('/tmp',path.join(root,'apps/web/src/escape'));
 assert(policy.check(root).issues.includes('INVALID_OR_MISSING_WORKSPACE:web'));
}));
test('empty directory and missing workspace fail closed',()=>fixture(root=>{
 fs.rmSync(path.join(root,'apps/api/package.json'));
 assert(policy.check(root).issues.includes('INVALID_OR_MISSING_WORKSPACE:api'));
}));
test('new source policy is registered to run before npm ci in GitHub Actions',()=>{
 const yaml=fs.readFileSync(path.join(ROOT,'.github/workflows/ci.yml'),'utf8');
 assert(yaml.includes('npm run verify:v80'));
 const policyCommand=yaml.indexOf('npm run build:imports:v80');const install=yaml.indexOf('run: npm ci');
 assert(policyCommand>=0&&install>policyCommand);
});
