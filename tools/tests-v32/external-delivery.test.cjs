const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ts=require('../test-typescript-loader.cjs');const file=path.resolve(__dirname,'../../apps/api/src/contexts/content-publishing/application/delivery-port.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports},{timeout:2000});
const Adapter=mod.exports.DisabledExternalNotificationAdapter;
test('external provider adapter fails safely when no provider is installed',async()=>{for(const channel of ['EMAIL','SMS']){const response=await new Adapter().send({organizationId:'o',recipientId:'r',channel,subject:'x',body:'x'});assert.equal(response.sent,false);assert.equal(response.status,'NOT_CONFIGURED')}});
test('external adapter rejects unsupported channel instead of claiming delivery',async()=>{await assert.rejects(()=>new Adapter().send({channel:'PUSH'}))});
