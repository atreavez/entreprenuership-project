'use strict';
/** Source-independent policy for a disposable PostgreSQL two-session contract. */
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {randomBytes}=require('node:crypto');
function assertDisposableContractEnvironment(env){
 const target=validateDisposablePgTarget(env);
 if(env.ASSETTRUST_V41_CONCURRENCY_CONTRACT!=='YES')throw Error('Explicit v0.41 isolated-schema concurrency contract authorization required');
 if(env.CI!=='true' && env.ASSETTRUST_V41_LOCAL_CONFIRM!=='YES')throw Error('CI=true or explicit local test confirmation required');
 return target;
}
function makeSchemaName(random=randomBytes){
 const entropy=random(12);
 if(!Buffer.isBuffer(entropy)||entropy.length!==12)throw Error('Expected 96-bit random schema identifier');
 return `assettrust_v41_test_${entropy.toString('hex')}`;
}
function quoteControlledSchema(name){
 if(typeof name!=='string'||!/^assettrust_v41_test_[0-9a-f]{24}$/.test(name))throw Error('Untrusted temporary schema name');
 return `"${name}"`;
}
module.exports={assertDisposableContractEnvironment,makeSchemaName,quoteControlledSchema};
