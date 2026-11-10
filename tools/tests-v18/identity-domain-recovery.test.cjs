const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../apps/api/src/contexts/identity/domain/identity-policy.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const box={module:{exports:{}},exports:{},require,Buffer,Date,console};box.exports=box.module.exports;
vm.runInNewContext(compiled,box,{timeout:3000});
const {isValidRecoveryCode}=box.module.exports;
test('recovery-code format is a pure, framework-independent domain rule',()=>{
 for(const value of ['abcdefghijklmn','AbcdEFG123_456','0123456789-_ab'])assert.equal(isValidRecoveryCode(value),true);
 for(const value of [null,undefined,1234,'short','0123456789_-ab ', '0123456789_-a!', 'x'.repeat(200)])assert.equal(isValidRecoveryCode(value),false);
 assert.doesNotMatch(source,/@nestjs|\bpg\b|\bexpress\b|\breact\b/);
});
test('login and MFA-disable use the same domain-level recovery code policy',()=>{
 const auth=fs.readFileSync(path.join(__dirname,'../../apps/api/src/auth.ts'),'utf8');
 assert.match(auth,/isValidRecoveryCode\(backupCode\)/);
 assert.match(auth,/isValidRecoveryCode\(body\?\.backupCode\)/);
});
