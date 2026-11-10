"use strict";
const path=require('node:path');const {inspectRelease}=require('./release-gate-policy-v16.cjs');
const r=inspectRelease(path.resolve(__dirname,'..'));
for(const f of r.failures)console.error('BLOCKER: '+f);
for(const w of r.warnings)console.warn('NOTICE: '+w);
console.log(r.ok?'PASS: release artifact prerequisites checked (does not prove application build).':'FAIL: release is blocked; see blockers above.');
if(!r.ok)process.exitCode=1;
