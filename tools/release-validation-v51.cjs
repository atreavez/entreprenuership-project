'use strict';
/** v0.51: guarded, synchronous, supervised release validation for connected Kali/Linux.
 * No production approval. Does not generate/modify lockfiles or rotate live secrets.
 * All DB-writing checks require independently confirmed loopback disposable database.
 */
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');const {randomBytes}=require('node:crypto');
const {audit}=require('./supply-chain-policy-v51.cjs');
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls}=require('./runtime-role-policy-v57.cjs');
const ROOT=path.resolve(__dirname,'..');
const VALID_MODES=new Set(['--plan','--preflight','--validate','--database','--full']);
function parseMode(argv){if(argv.length!==1||!VALID_MODES.has(argv[0]))throw Error('Choose exactly one: --plan, --preflight, --validate, --database or --full');return argv[0];}
function assertDbTarget(env){
 const target=validateDisposablePgTarget(env);
 if(env.ASSETTRUST_V51_ALLOW_DATABASE_TESTS!=='YES')throw Error('v0.51 DB mutation authorization missing');
 if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('Live HTTP test suite requires assettrust_ci or assettrust_test');
 if(env.ASSETTRUST_V51_DB_CONFIRM!==target.databaseName)throw Error('Explicit confirmation must exactly match disposable database name');
 if(env.ASSETTRUST_V51_LOCAL_CONFIRM!=='YES' && env.CI!=='true')throw Error('Local confirmation or CI=true required');
 // v0.58: NEVER enter a supervised multi-API run using the fixture/operator account.
 if(env.CI!=='true'||env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES'||env.ASSETTRUST_V58_SEEDED_RLS_CONFIRM!=='YES'||env.ASSETTRUST_V59_CRUD_CONFIRM!=='YES'||env.ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM!=='YES'||env.ASSETTRUST_V63_POLICY_CONFIRM!=='YES')
  throw Error('Supervised database validation requires CI test mode, restricted runtime role, and seeded-RLS plus authorized-CRUD confirmation');
 validateRuntimeDatabaseUrls(env.DATABASE_URL,env.ASSETTRUST_RUNTIME_DATABASE_URL);
 return {databaseName:target.databaseName,host:target.host};
}
function buildSteps(manifest,env=process.env){
 const versions=Object.keys(manifest.scripts||{}).filter(s=>/^verify:v\d{2}$/.test(s)).sort();
 const verified=['verify:ci:v41','verify:architecture','verify:syntax',...versions];
 return [
  {name:'npm-ci',bin:'npm',args:['ci','--no-fund']},
  {name:'npm-audit-production',bin:'npm',args:['audit','--omit=dev','--audit-level=high']},
  ...verified.map(s=>({name:s,bin:'npm',args:['run',s]})),
  ...(manifest.scripts?.['security:clamav:v52'] ? [{name:'live-clamav-scanner',bin:'npm',args:['run','security:clamav:v52']}] : []),
  {name:'api-unit-tests',bin:'npm',args:['test']},
  {name:'api-and-web-build',bin:'npm',args:['run','build']},
  {name:'post-build-artifact-gate',bin:'npm',args:['run','build:artifacts:v56']},
  {name:'full-git-history-secret-scan',bin:'npm',args:['run','security:scan:v54',...(env.ASSETTRUST_HISTORY_REPO?['--','--repo',env.ASSETTRUST_HISTORY_REPO]:[])]},
 ];
}
function dbSteps(manifest){
 const suites=Object.keys(manifest.scripts||{}).filter(s=>s.startsWith('test:pg:')).sort();
 // Explicit dependency order: role identity -> privilege boundaries -> seeded isolation -> authorized CRUD.
 // Lexical sorting would run 'crud' before 'isolation', weakening evidence ordering.
 const ordered=['test:pg:runtime-role:v57','test:pg:policy-contract:v63','test:pg:runtime-privileges:v60','test:pg:audit-rls:v61','test:pg:operational-rls:v62','test:pg:runtime-tenant-isolation:v58','test:pg:runtime-tenant-crud:v59'];
 const orderedSets=suites.filter(s=>ordered.includes(s)).sort((a,b)=>ordered.indexOf(a)-ordered.indexOf(b));
 const remaining=suites.filter(s=>!ordered.includes(s));
 const allSuites=[...orderedSets,...remaining];
 return [
  {name:'migrate-disposable-database',bin:'npm',args:['run','db:migrate']},
  {name:'migration-immutability-check',bin:'npm',args:['run','db:check']},
  ...allSuites.map(s=>({name:s,bin:'npm',args:['run',s]})),
  {name:'two-real-api-instances',bin:'npm',args:['run','test:e2e:two-api:v42']},
  {name:'supervised-http-integrations',bin:'npm',args:['run','test:e2e:ci']},
 ];
}
function plan(root=ROOT,env=process.env){const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 return {build:buildSteps(manifest,env),database:dbSteps(manifest)};}
function summaryFile(root=ROOT){return path.join(root,'test-evidence','v51','local-validation-summary.json');}
function prepare(root=ROOT,env=process.env,mode='--preflight'){
 const result={mode,sourceVersion:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,productionApproved:false,issues:[],supplyChain:null,target:null};
 if(!['--plan','--preflight'].includes(mode)){
  if(['--full','--database'].includes(mode)){
   try{result.target=assertDbTarget(env)}catch(e){result.issues.push(e.message);}
  }
  result.supplyChain=audit(root);
  if(!result.supplyChain.ok)result.issues.push(...result.supplyChain.issues);
 }else if(mode==='--preflight'){
  result.supplyChain=audit(root);
  if(!result.supplyChain.ok)result.issues.push(...result.supplyChain.issues);
 }
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<12))result.issues.push('Node >=22.12 required');
 return {...result,ok:result.issues.length===0};
}
function execute(root=ROOT,mode='--plan',env=process.env,runner=spawnSync){
 const target=prepare(root,env,mode);
 if(mode==='--plan')return {mode,status:'PLAN_ONLY',productionApproved:false,buildSteps:plan(root,env).build.map(x=>x.name),dbSteps:plan(root,env).database.map(x=>x.name)};
 if(mode==='--preflight')return {mode,status:target.ok?'STATIC_PREREQUISITES_PRESENT':'BLOCKED',productionApproved:false,issues:target.issues,supplyChain:target.supplyChain};
 const output={schema:'ASSETTRUST_V51_SUPERVISED_VALIDATION',mode,status:'BLOCKED',productionApproved:false,issues:target.issues,steps:[],summaryPath:'test-evidence/v51/local-validation-summary.json'};
 // Important: never create a report, spawn or mutate anything if preconditions fail.
 if(!target.ok)return output;
 const tasks=[...(['--full','--validate'].includes(mode)?plan(root,env).build:[]),...(['--full','--database'].includes(mode)?plan(root,env).database:[])];
 // No remote URLs or credentials are ever placed into the evidence file.
 const e2eMarker='assettrust-supervised-'+randomBytes(24).toString('hex');
 const subprocessEnv={...env,ASSETTRUST_V41_CONCURRENCY_CONTRACT:'YES',ASSETTRUST_V41_LOCAL_CONFIRM:'YES',
  ...(['--full','--database'].includes(mode)?{CI:'true',ASSETTRUST_V42_TWO_API_CONTRACT:'YES',
   ASSETTRUST_E2E_URL:env.ASSETTRUST_E2E_URL||'http://127.0.0.1:4000',
   ASSETTRUST_E2E_TARGET_ID:e2eMarker,ASSETTRUST_E2E_EXPECT_TARGET:e2eMarker}:{} )};
 for(const step of tasks){
  const start=Date.now();
  const result=runner(step.bin,step.args,{cwd:root,env:subprocessEnv,stdio:'inherit',timeout:25*60*1000});
  const success=result.status===0&&!result.error&&!result.signal;
  output.steps.push({name:step.name,ok:success,exitCode:result.status??null,durationMs:Date.now()-start});
  if(!success){output.issues.push(`Stopped at ${step.name} (nonzero exit, signal, or timeout)`);break;}
 }
 output.status=output.issues.length?'FAILED':'VALIDATION_STEPS_PASSED_NOT_RELEASE_APPROVAL';
 const file=summaryFile(root);fs.mkdirSync(path.dirname(file),{recursive:true});
 // Refuse to follow a malicious symlink from a compromised working tree.
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Refusing symlink evidence destination');
 fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n',{mode:0o600,flag:'w'});
 return output;
}
if(require.main===module){
 try{
  const mode=parseMode(process.argv.slice(2));const result=execute(ROOT,mode,process.env);
  console.log(JSON.stringify(result,null,2));
  if(result.status==='BLOCKED'||result.status==='FAILED')process.exitCode=1;
 }catch(e){console.error(`BLOCKED: ${e.message}`);process.exitCode=1;}
}
module.exports={parseMode,assertDbTarget,buildSteps,dbSteps,plan,prepare,execute};
