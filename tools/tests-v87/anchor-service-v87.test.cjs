'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../test-typescript-loader.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../apps/api/src/contexts/anchoring/application/anchor-service.ts'),'utf8');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Error,Object,JSON,Number,RegExp},{timeout:3000});
const {AnchorService}=mod.exports;
const target={providerId:'test-provider',networkId:'testnet',minConfirmations:6},commitment='a'.repeat(64),transactionId='tx-123';
const receipt={networkId:target.networkId,transactionId,commitment,canonical:true,confirmations:6};
const adapter=(overrides={})=>({providerId:target.providerId,submit:async()=>({transactionId}),observe:async()=>receipt,...overrides});
test('disconnected provider never produces an anchor',async()=>{
 const service=new AnchorService();
 assert.equal((await service.submit(target,commitment)).state,'NOT_CONNECTED');
 assert.equal((await service.verify(target,commitment,transactionId)).anchored,false);
});
test('submissions send only digest, network and stable idempotency key; never claim confirmation',async()=>{
 const requests=[];
 const service=new AnchorService(adapter({submit:async r=>{requests.push(r);return {transactionId}}}));
 assert.equal((await service.submit(target,commitment)).state,'SUBMITTED');
 assert.equal((await service.submit(target,commitment)).anchored,false);
 assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey);
 assert.deepEqual(Object.keys(requests[0]).sort(),['commitment','idempotencyKey','networkId']);
 await service.submit({...target,networkId:'other-chain'},commitment);
 assert.notEqual(requests[0].idempotencyKey,requests[2].idempotencyKey);
});
test('trusted observation requires matching chain, transaction, digest, canonicality and sufficient confirmations',async()=>{
 for(const changes of [{networkId:'wrong'},{transactionId:'wrong'},{commitment:'b'.repeat(64)},{canonical:false},{confirmations:-1},{confirmations:NaN},{confirmations:1.5}]){
  const result=await new AnchorService(adapter({observe:async()=>({...receipt,...changes})})).verify(target,commitment,transactionId);
  assert.equal(result.state,'REORG_OR_INVALID');assert.equal(result.anchored,false);
 }
 for(const observation of [null,{...receipt,confirmations:5}]){
  assert.equal((await new AnchorService(adapter({observe:async()=>observation})).verify(target,commitment,transactionId)).state,'PENDING');
 }
 assert.equal((await new AnchorService(adapter()).verify(target,commitment,transactionId)).anchored,true);
});
test('provider failures and uncertain submissions never report success',async()=>{
 const fail=async()=>{throw Error('provider unreachable')};
 const service=new AnchorService(adapter({submit:fail,observe:fail}));
 assert.equal((await service.submit(target,commitment)).state,'RETRY_REQUIRED');
 assert.equal((await service.verify(target,commitment,transactionId)).state,'RETRY_REQUIRED');
 assert.equal((await new AnchorService(adapter({submit:async()=>({transactionId:''})})).submit(target,commitment)).anchored,false);
});
test('invalid inputs and mismatched provider rejected before network calls',async()=>{
 let calls=0;
 const service=new AnchorService(adapter({submit:async()=>{calls++;return {transactionId}}}));
 for(const bad of [{...target,minConfirmations:0},{...target,minConfirmations:1.5},{...target,providerId:'wrong'},{...target,networkId:'https://example.com'}])
  await assert.rejects(service.submit(bad,commitment));
 await assert.rejects(service.submit(target,'GENESIS'));
 assert.equal(calls,0);
});
test('rechecking a previously confirmed receipt detects loss of canonicality',async()=>{
 let canonical=true;
 const service=new AnchorService(adapter({observe:async()=>({...receipt,canonical})}));
 assert.equal((await service.verify(target,commitment,transactionId)).anchored,true);
 canonical=false;
 assert.equal((await service.verify(target,commitment,transactionId)).state,'REORG_OR_INVALID');
});
