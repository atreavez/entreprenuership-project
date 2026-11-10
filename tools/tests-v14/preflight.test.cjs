'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {evaluateBuildPrerequisites}=require('../preflight-policy-v14.cjs');
const base={nodeVersion:'v22.16.0',required:['@nestjs/common','pg','typescript','vite','react'],available:['@nestjs/common','pg','typescript','vite','react'],lockfile:false};
test('missing NestJS package blocks verified build readiness',()=>{const result=evaluateBuildPrerequisites({...base,available:['pg','typescript','vite','react']});assert.equal(result.ok,false);assert.ok(result.issues.includes('MISSING_DEPENDENCIES'));});
test('unsupported Node version blocks verified build readiness',()=>{const result=evaluateBuildPrerequisites({...base,nodeVersion:'v20.10.0'});assert.equal(result.ok,false);assert.ok(result.issues.includes('UNSUPPORTED_NODE_VERSION'));});
test('supported Node and all packages permit local compilation attempt',()=>{const result=evaluateBuildPrerequisites(base);assert.equal(result.ok,true);assert.deepEqual(result.missing,[]);});
test('a lockfile is a reproducibility warning, not a false claim of build failure',()=>{const result=evaluateBuildPrerequisites(base);assert.ok(result.warnings.includes('NO_LOCKFILE'));});
test('missing dependencies are deduplicated',()=>{const result=evaluateBuildPrerequisites({...base,required:['react','react','vite'],available:[]});assert.deepEqual(result.missing,['react','vite']);});
