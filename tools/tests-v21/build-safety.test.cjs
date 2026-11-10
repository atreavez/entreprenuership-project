'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
test('API failed TypeScript compile must not emit potentially incomplete runnable JavaScript',()=>{
 const tsconfig=JSON.parse(fs.readFileSync(path.join(root,'apps/api/tsconfig.json'),'utf8'));
 assert.equal(tsconfig.compilerOptions.noEmitOnError,true,'noEmitOnError must remain enabled');
});
test('compiled dist and private upload storage stay out of tracked source',()=>{
 const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
 assert.match(ignore,/(?:^|\n)dist\//);
 assert.match(ignore,/(?:^|\n)private-uploads\//);
});
