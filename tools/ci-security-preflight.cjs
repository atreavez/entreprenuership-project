'use strict';
/** Check the REAL application startup policy against this process's CI environment. */
const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
function checkEnvironment(env=process.env){
 const temp=mkdtempSync(join(tmpdir(),'assettrust-ci-runtime-'));
 try{
  const code=spawnSync(process.execPath,[
   require.resolve('typescript/bin/tsc'),
   '--strict','--target','es2022','--module','commonjs','--noEmitOnError',
   '--outDir',temp,resolve(__dirname,'../apps/api/src/contexts/platform/domain/runtime-config.ts')
  ],{encoding:'utf8'});
  if(code.error)throw Error('Cannot start TypeScript compiler: '+code.error.message);
  if(code.status!==0)throw Error('Cannot compile runtime configuration domain policy: '+String(code.stderr||code.stdout||'Compiler exited without output').slice(0,600));
  const {validateRuntimeConfig}=require(join(temp,'runtime-config.js'));
  const result=validateRuntimeConfig(env);
  if(!result.ok)throw Error('Startup rejected configuration: '+result.issues.map(i=>i.code).join(', '));
  if(env.CI==='true' && (env.NODE_ENV!=='test' ||
     typeof env.ASSETTRUST_E2E_TARGET_ID!=='string' ||
     env.ASSETTRUST_E2E_TARGET_ID.length<12 ||
     env.ASSETTRUST_E2E_TARGET_ID!==env.ASSETTRUST_E2E_EXPECT_TARGET))
   throw Error('CI test mode or instance identity is not configured safely');
  return result;
 }finally{rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module){
 try{checkEnvironment();console.log('PASS: AssetTrust startup configuration is valid (secret values were not printed).')}
 catch(e){console.error('FAIL: '+e.message);process.exitCode=1}
}
module.exports={checkEnvironment};
