'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../..');
const contractSource=fs.readFileSync(path.join(ROOT,'apps/web/src/readiness-contract.ts'),'utf8');
const ui=fs.readFileSync(path.join(ROOT,'apps/web/src/DeploymentReadinessPage.tsx'),'utf8');
const compiled=ts.transpileModule(contractSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
assert.equal(compiled.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const mod={exports:{}};vm.runInNewContext(compiled.outputText,{module:mod,exports:mod.exports,Error,Number},{timeout:2500});
const {parseReadinessEvidence:parse}=mod.exports;
const good=()=>({ok:true,service:'assettrust-api',version:'0.67.0',database:'ready',postgis:'ready',schema:'verified-migration-ledger',security:'rls-policy-contract-verified',migrationsVerified:27,rlsPoliciesVerified:16,protectedTablesVerified:13});
test('explicitly verified live response can be displayed',()=>{
 const out=parse(good());assert.equal(out.version,'0.67.0');assert.equal(out.migrationsVerified,27);assert.equal(out.rlsPoliciesVerified,16);
});
test('legacy health-only and readiness-less responses never count as ready',()=>{
 for(const b of [null,undefined,[],true,{}, {ok:true}, {ok:true,service:'assettrust-api'}])assert.throws(()=>parse(b));
});
test('misleading service/schema/security strings fail closed',()=>{
 for(const [key,value] of [['service','other-service'],['schema','migrations-pending'],['security','skipped'],['postgis','offline'],['database','ready-ish'],['ok',false]]){
  assert.throws(()=>parse({...good(),[key]:value}),key);
 }
});
test('null, zero, fractional, negative and unsafe counts rejected',()=>{
 for(const key of ['migrationsVerified','rlsPoliciesVerified','protectedTablesVerified']){
  for(const value of [null,0,-1,2.2,'16',Number.MAX_SAFE_INTEGER+1,NaN])assert.throws(()=>parse({...good(),[key]:value}),key+'='+value);
 }
});
test('unverifiable version labels and malformed semver rejected',()=>{
 for(const version of [null,0,'','v0.67','0.67','0.67.0-dev','1.67.0','0.66.0;DROP TABLE'])assert.throws(()=>parse({...good(),version}));
});
test('parser only returns allowlisted response attributes',()=>{
 const response={...good(),token:'not-exposed',DATABASE_URL:'postgres://private'};
 const parsed=parse(response);assert.equal(Object.keys(parsed).length,4);
 assert.doesNotMatch(JSON.stringify(parsed),/not-exposed|private|postgres/);
});
test('frontend cancels previous readiness fetch before starting a new one',()=>{
 assert.match(ui,/activeProbe\.current\?\.abort\(\)/);
 assert.match(ui,/const controller=new AbortController\(\)/);
 assert.match(ui,/signal:AbortSignal\.any\(\[controller\.signal,AbortSignal\.timeout\(8000\)\]\)/);
});
test('response and async integration updates are gated by latest request identity',()=>{
 assert.match(ui,/if\(!current\(\)\)return;/);
 assert.match(ui,/if\(current\(\)\)setIntegrations\(result\)/);
 assert.match(ui,/if\(current\(\)\)setIntegrationError/);
});
test('unmount or role change aborts previous readiness request',()=>{
 assert.match(ui,/useEffect\(\(\)=>\{if\(!DEMO\)void check\(\);return\(\)=>\{activeProbe\.current\?\.abort\(\);activeProbe\.current=null;\}\},\[check\]\)/);
 assert.match(ui,/\},\[token,role\]\)/);
});
test('UI has explicit release disclaimer and never claims production approval',()=>{
 assert.match(ui,/does not mean the product is production approved/);
 assert.match(ui,/does not certify ownership/);
});
