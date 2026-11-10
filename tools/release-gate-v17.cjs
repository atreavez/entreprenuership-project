'use strict';
const {resolve}=require('node:path');
const {inspectRelease}=require('./release-gate-policy-v16.cjs');
const {inspectDependencyGraph}=require('./lockfile-integrity-v17.cjs');
const root=resolve(__dirname,'..');
const checks=[inspectRelease(root),inspectDependencyGraph(root)];
for(const check of checks){
 for(const failure of check.failures)console.error('BLOCKER:',failure);
 for(const warning of check.warnings||[])console.warn('NOTICE:',warning);
}
if(checks.every(x=>x.ok))console.log('PASS: static release graph checked. Run npm ci and npm run build separately.');
else{console.error('FAIL: release remains blocked. Do not publish or deploy.');process.exitCode=1;}
