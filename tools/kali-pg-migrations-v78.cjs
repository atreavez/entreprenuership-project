'use strict';
/** Private v0.78 Kali launcher for read-only disposable PostgreSQL lock acceptance. */
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const local=require('./local-kali-integration-v70.cjs');
const ROOT=path.resolve(__dirname,'..');
function plan(){return {schema:'ASSETTRUST_V78_KALI_MIGRATION_PLAN',status:'NOT_EXECUTED',productionApproved:false,
  steps:['Run offline v0.78 regression','Prepare isolated v0.70 PostGIS and 27 migrations',
   'Prove contended lock refuses promptly','Prove unrestricted check after unlock'],
  requiredConfirmation:'ASSETTRUST_V70_LOCAL_CONFIRM=YES ASSETTRUST_V78_PG_CONFIRM=YES'};}
function check(env=process.env){if(env.ASSETTRUST_V70_LOCAL_CONFIRM!=='YES'||env.ASSETTRUST_V78_PG_CONFIRM!=='YES'||env.NODE_ENV==='production')throw Error('DISPOSABLE_CONFIRMATION_REQUIRED');}
function execute({root=ROOT,env=process.env,load=local.load,runner=spawnSync}={}){
 check(env);
 const {env:credentials}=load({root,requireRuntime:false});
 if(credentials.NODE_ENV!=='test'||credentials.CI!=='true'||credentials.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES')throw Error('DISPOSABLE_CONFIGURATION_INVALID');
 const child=runner(process.execPath,['tools/e2e-pg-migration-lock-v78.mjs','--run'],{
  cwd:root,shell:false,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90000,maxBuffer:16384,
  env:{PATH:env.PATH||process.env.PATH||'',HOME:env.HOME||process.env.HOME||'',...credentials,ASSETTRUST_V78_PG_CONFIRM:'YES'}});
 let result=null;
 try{result=JSON.parse(String(child.stdout||'').slice(0,2048).trim());}catch{}
 if(child.status!==0||child.error||child.signal||result?.schema!=='ASSETTRUST_V78_REAL_PG_RESULT'||result?.status!=='PASSED'||!Number.isSafeInteger(result.checks)||result.checks!==6)
  return {schema:'ASSETTRUST_V78_KALI_RESULT',status:'FAILED',productionApproved:false,reason:'Read-only local PostgreSQL acceptance failed; inspect private local logs'};
 return {schema:'ASSETTRUST_V78_KALI_RESULT',status:'PG_CHECK_PASSED_RELEASE_BLOCKED',checks:result.checks,productionApproved:false,releaseStatus:'NO_GO'};
}
if(require.main===module){try{
 const action=process.argv[2];if(process.argv.length!==3||!['--plan','--run'].includes(action))throw Error('Use --plan or --run');
 const result=action==='--plan'?plan():execute();console.log(JSON.stringify(result,null,2));if(result.status==='FAILED')process.exitCode=1;
}catch{console.error('BLOCKED: Missing or unsafe disposable integration prerequisites');process.exitCode=1;}}
module.exports={plan,check,execute};
