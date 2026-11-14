'use strict';
/** v0.77: locked-down Kali wrapper for disposable PostgreSQL dispute acceptance. */
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const local=require('./local-kali-integration-v70.cjs');
const ROOT=path.resolve(__dirname,'..');
function plan(){return {schema:'ASSETTRUST_V77_KALI_PG_PLAN',productionApproved:false,
  status:'NOT_EXECUTED',target:'v0.70 local disposable PostGIS, non-bypass runtime role',
  steps:['Prepare fresh v0.70 private credentials','Start PostGIS and apply migrations',
   'Provision and verify restricted runtime role','Run 2-case dispute source acceptance through real PostgreSQL',
   'Confirm cleanup; inspect failed or timed-out cases manually'],
  requiredConfirmation:'ASSETTRUST_V77_PG_CONFIRM=YES ASSETTRUST_V70_LOCAL_CONFIRM=YES'};}
function check(env=process.env){
 if(env.ASSETTRUST_V77_PG_CONFIRM!=='YES'||env.ASSETTRUST_V70_LOCAL_CONFIRM!=='YES'||env.NODE_ENV==='production')
  throw Error('Explicit disposable database confirmation required');
}
function execute({root=ROOT,env=process.env,load=local.load,runner=spawnSync}={}){
 check(env);
 const {env:credentials}=load({root,requireRuntime:true});
 if(credentials.NODE_ENV!=='test'||credentials.CI!=='true'||credentials.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES')
  throw Error('Private disposable configuration is not authorized');
 const child=runner(process.execPath,['tools/e2e-pg-cross-case-disputes-v77.mjs','--run'],{
  cwd:root,env:{PATH:env.PATH||process.env.PATH||'',HOME:env.HOME||process.env.HOME||'',
   ...credentials,ASSETTRUST_V77_PG_CONFIRM:'YES'},shell:false,encoding:'utf8',
  stdio:['ignore','pipe','pipe'],timeout:4*60*1000,maxBuffer:64*1024});
 // Only allow schema-known, bounded, JSON status output from a supervised child.
 const safe=(s)=>String(s||'').slice(0,1200);
 let result=null;
 try{result=JSON.parse(safe(child.stdout).trim())}catch{}
 if(child.status!==0||child.error||child.signal||result?.schema!=='ASSETTRUST_V77_REAL_PG_RESULT'||result?.status!=='PASSED')
  return {schema:'ASSETTRUST_V77_KALI_PG_RESULT',status:'FAILED',productionApproved:false,
   reason:'Real PostgreSQL test failed or did not return a valid pass report; review private local diagnostics'};
 return {schema:'ASSETTRUST_V77_KALI_PG_RESULT',status:'POSTGRES_ACCEPTANCE_PASSED_RELEASE_BLOCKED',
  checks:result.checks,productionApproved:false,releaseStatus:'NO_GO'};
}
if(require.main===module){
 try{
  const action=process.argv[2];
  if(process.argv.length!==3||!['--plan','--run'].includes(action))throw Error('Use --plan or --run');
  const outcome=action==='--plan'?plan():execute();
  console.log(JSON.stringify(outcome,null,2));
  if(outcome.status==='FAILED')process.exitCode=1;
 }catch{console.error('BLOCKED: Disposable integration prerequisites missing or unsafe');process.exitCode=1;}
}
module.exports={plan,check,execute};
