'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {validateLayerSource,inspectCleanArchitecture}=require('../clean-architecture-v17.cjs');
test('all bounded contexts keep domain and application free of outward infrastructure dependencies',()=>{
 const r=inspectCleanArchitecture(resolve(__dirname,'../..'));
 assert.ok(r.checked>=10,`Only ${r.checked} layers were checked`);
 assert.deepEqual(r.failures,[]);
});
test('blocks framework imports and controller decorators',()=>{
 const r=validateLayerSource("import { Injectable } from '@nestjs/common'; @Injectable() class A {}",'fake.ts');
 assert.match(r.join(' '),/forbidden framework/);assert.match(r.join(' '),/framework decorator/);
});
test('blocks database and direct infrastructure dependencies',()=>{
 assert.match(validateLayerSource("import pg from 'pg';",'fake.ts').join(' '),/database/);
 assert.match(validateLayerSource("import { adapter } from '../infrastructure/adapter';",'fake.ts').join(' '),/inward dependency/);
});
test('blocks direct environment reads and I/O operations',()=>{
 assert.match(validateLayerSource("const v=process.env.JWT_SECRET;",'fake.ts').join(' '),/process.env/);
 assert.match(validateLayerSource("import {readFileSync} from 'node:fs';",'fake.ts').join(' '),/I\/O imported/);
});
