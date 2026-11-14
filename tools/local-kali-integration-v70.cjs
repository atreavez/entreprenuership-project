'use strict';
/**
 * AssetTrust v0.70: locally owned, disposable Kali PostGIS integration workflow.
 * Never connects to a public database; never rotates an existing database's key;
 * never prints credentials or approves a production release.
 * The offline unit tests inject a runner; only explicit CLI steps launch commands.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {validateRuntimeDatabaseUrls}=require('./runtime-role-policy-v57.cjs');
const ROOT=path.resolve(__dirname,'..');
const PRIVATE_REL='.assettrust-local/v70';
const OPERATOR='assettrust_v70_operator';
const DB='assettrust_test';
const PORT=55432;
const REVIEWED_COMPOSE_SHA256='3af9c5432b9bf9bea5a5ef07b2825894b67d6ba0a9aea92f86d0dfab98bc7802';
const COMMANDS=Object.freeze(['--plan','--doctor','--prepare','--start','--start-scanner','--migrate','--provision','--verify','--run-http']);
const LIVE_STEPS=new Set(['--start','--start-scanner','--migrate','--provision','--verify','--run-http']);
const CODES=Object.freeze({
 '--start':'DATABASE_CONTAINER_START_FAILED','--start-scanner':'LOCAL_CLAMAV_START_FAILED','--migrate':'SCHEMA_MIGRATION_FAILED',
 '--provision':'RUNTIME_ROLE_PROVISION_FAILED','--verify':'DATABASE_INTEGRITY_CHECK_FAILED',
 '--run-http':'AUTHENTICATED_HTTP_ACCEPTANCE_FAILED'
});
const GENERATED_FILES=Object.freeze(['pg-password','operator.env','role.env']);
function mustFile(file){
 const st=fs.lstatSync(file,{throwIfNoEntry:false});
 if(!st||!st.isFile()||st.isSymbolicLink())throw Error('REQUIRED_REGULAR_SOURCE_FILE_MISSING');
 return st;
}
function privateFile(file){
 const st=mustFile(file);
 if((st.mode&0o077)!==0)throw Error('PRIVATE_FILE_PERMISSIONS_UNSAFE');
 return st;
}
function requireRoot(root=ROOT){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(pkg.name!=='assettrust-platform'||!pkg.scripts?.['test:pg:runtime-role:v57']||!pkg.scripts?.['db:migrate'])
  throw Error('UNRECOGNIZED_SOURCE_CHECKOUT');
 const compose=path.join(root,'compose.integration-v70.yaml');
 mustFile(compose);
 const fingerprint=crypto.createHash('sha256').update(fs.readFileSync(compose)).digest('hex');
 if(fingerprint!==REVIEWED_COMPOSE_SHA256)throw Error('REVIEWED_COMPOSE_CONTRACT_CHANGED');
 return pkg;
}
function paths(root=ROOT){
 const dir=path.join(root,PRIVATE_REL);
 return {root,dir,password:path.join(dir,'pg-password'),operator:path.join(dir,'operator.env'),role:path.join(dir,'role.env')};
}
function safeDirectory(directory){
 const st=fs.lstatSync(directory,{throwIfNoEntry:false});
 if(st&&(!st.isDirectory()||st.isSymbolicLink()))throw Error('UNSAFE_LOCAL_CONFIGURATION_PATH');
 if(st&&(st.mode&0o077)!==0)throw Error('PRIVATE_DIRECTORY_PERMISSIONS_UNSAFE');
 return Boolean(st);
}
function safeCreateFile(file,contents){
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,contents,{encoding:'utf8'});fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.chmodSync(file,0o600);
}
function uniqueSecrets(random=crypto.randomBytes){
 const values=[];
 for(let i=0;i<5;i++){
  const bytes=random(32);
  if(!Buffer.isBuffer(bytes)||bytes.length!==32)throw Error('SECURE_RANDOMNESS_REQUIRED');
  values.push(bytes.toString('hex'));
 }
 if(new Set(values).size!==values.length||values.some(s=>/^(.)\1{63}$/.test(s)))throw Error('SECURE_RANDOMNESS_REQUIRED');
 return values;
}
function prepare({root=ROOT,random=crypto.randomBytes}={}){
 requireRoot(root);
 const p=paths(root);
 const parent=path.dirname(p.dir);
 if(fs.lstatSync(parent,{throwIfNoEntry:false}))throw Error('LOCAL_CONFIGURATION_ALREADY_EXISTS_DO_NOT_OVERWRITE');
 // This directory is only for a fresh v0.70 disposable instance, never an old one.
 fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(p.dir,{mode:0o700});
 const [password,jwt,mfa,document,pepper]=uniqueSecrets(random);
 const url='postgres://'+OPERATOR+':'+password+'@127.0.0.1:'+PORT+'/'+DB;
 const config=[
  'NODE_ENV=test','CI=true','ASSETTRUST_E2E_ALLOW_MUTATION=YES',
  'ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES',
  'ASSETTRUST_E2E_URL=http://127.0.0.1:4000',
  'DATABASE_URL='+url,
  'JWT_SECRET='+jwt,'MFA_ENCRYPTION_KEY='+mfa,
  'LOGIN_ABUSE_PEPPER='+pepper,
  'DOCUMENT_ACTIVE_KEY_ID=v70',
  'DOCUMENT_ENCRYPTION_KEYS='+JSON.stringify({v70:document}),
  'WEB_ORIGIN=http://localhost:5173',
  'UPLOAD_DIR='+path.join(p.dir,'private-uploads'),
  'PORT=4000',
  'CLAMAV_TCP_PORT=13310'
 ].join('\n')+'\n';
 safeCreateFile(p.password,password+'\n');
 safeCreateFile(p.operator,config);
 safeCreateFile(p.role,'');
 fs.mkdirSync(path.join(p.dir,'private-uploads'),{mode:0o700});
 return {schema:'ASSETTRUST_V70_PREPARED',status:'LOCAL_SECRET_FILES_CREATED',productionApproved:false,
  databaseName:DB,databaseHost:'127.0.0.1',databasePort:PORT,secretValuesExposed:false,
  next:'Review compose.integration-v70.yaml and run --start on trusted Kali with explicit consent'};
}
function parseEnv(contents){
 const obj=Object.create(null);
 for(const line of contents.split(/\r?\n/)){
  if(!line)continue;
  const i=line.indexOf('=');
  if(i<1||!/^[A-Z][A-Z0-9_]*$/.test(line.slice(0,i)))throw Error('INVALID_PRIVATE_ENV_FILE');
  const key=line.slice(0,i);
  if(Object.hasOwn(obj,key))throw Error('DUPLICATE_PRIVATE_ENV_ENTRY');
  obj[key]=line.slice(i+1);
 }
 return obj;
}
function load({root=ROOT,requireRuntime=false}={}){
 requireRoot(root);
 const p=paths(root);
 if(!safeDirectory(path.dirname(p.dir))||!safeDirectory(p.dir))throw Error('LOCAL_SETUP_NOT_PREPARED');
 for(const f of GENERATED_FILES)privateFile(path.join(p.dir,f));
 const operator=parseEnv(fs.readFileSync(p.operator,'utf8'));
 const password=fs.readFileSync(p.password,'utf8').trim();
 if(!/^[0-9a-f]{64}$/.test(password)||!operator.DATABASE_URL||operator.NODE_ENV!=='test'||operator.CI!=='true'||
    operator.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||operator.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')
  throw Error('LOCAL_CONFIGURATION_INVALID');
 let url;try{url=new URL(operator.DATABASE_URL)}catch{throw Error('LOCAL_DATABASE_TARGET_INVALID');}
 if(url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.port!==String(PORT)||
    url.pathname!=='/'+DB||url.username!==OPERATOR||url.password!==password||url.search||url.hash)
  throw Error('LOCAL_DATABASE_TARGET_INVALID');
 const roleEnv=parseEnv(fs.readFileSync(p.role,'utf8'));
 if(Object.keys(roleEnv).some(k=>k!=='ASSETTRUST_RUNTIME_DATABASE_URL'))throw Error('UNEXPECTED_RUNTIME_ROLE_SETTINGS');
 if(requireRuntime&&!roleEnv.ASSETTRUST_RUNTIME_DATABASE_URL)throw Error('RESTRICTED_RUNTIME_ROLE_NOT_PROVISIONED');
 if(roleEnv.ASSETTRUST_RUNTIME_DATABASE_URL){
  try{validateRuntimeDatabaseUrls(operator.DATABASE_URL,roleEnv.ASSETTRUST_RUNTIME_DATABASE_URL)}
  catch{throw Error('RESTRICTED_RUNTIME_ROLE_CONFIGURATION_INVALID');}
 }
 return {p,env:{...operator,...roleEnv}};
}
function doctor({root=ROOT,exists=fs.existsSync}={}){
 const p=paths(root);let ready=false,runtimeRole=false,configurationIssue=null;
 try{const loaded=load({root});ready=true;runtimeRole=Boolean(loaded.env.ASSETTRUST_RUNTIME_DATABASE_URL);}
 catch(e){configurationIssue=String(e.message).replace(/[^A-Z0-9_]/g,'').slice(0,72);}
 return {schema:'ASSETTRUST_V70_LOCAL_DOCTOR',productionApproved:false,
  sourceRecognized:(()=>{try{requireRoot(root);return true;}catch{return false}})(),
  preparedConfigurationValid:ready,restrictedRuntimeConfigured:runtimeRole,
  genuineLockfilePresent:exists(path.join(root,'package-lock.json')),
  apiBuildPresent:exists(path.join(root,'apps/api/dist/main.js')),
  webBuildPresent:exists(path.join(root,'apps/web/dist/index.html')),
  configurationIssue,liveDatabaseTested:false,actualHttpAcceptancePassed:false,
  releaseStatus:'NO_GO'};
}
function authorize(step,env){
 if(!LIVE_STEPS.has(step))throw Error('INVALID_OPERATION');
 if(env.ASSETTRUST_V70_LOCAL_CONFIRM!=='YES'||env.NODE_ENV==='production')
  throw Error('LOCAL_DISPOSABLE_OPERATION_REQUIRES_EXPLICIT_CONFIRMATION');
}
function sanitize(text){
 return String(text||'').replace(/postgres(?:ql)?:\/\/[^\s"']+/ig,'[REDACTED_DATABASE_URL]')
  .replace(/\b[A-Fa-f0-9]{64}\b/g,'[REDACTED_KEY]').replace(/\b(?:Bearer|Basic)\s+[a-zA-Z0-9._~+/=:-]+/g,'[REDACTED_AUTHORIZATION]')
  .slice(-1200);
}
function runtimeArtifactsReady(root){
 const {detect,artifacts}=require('./build-acceptance-v68.cjs');
 const prerequisites=detect(root),compiled=artifacts(root);
 return prerequisites.ok===true&&compiled.ok===true;
}
function run(step,{root=ROOT,env=process.env,runner=spawnSync,artifactsReady=runtimeArtifactsReady}={}){
 authorize(step,env);
 const {p,env:local}=load({root,requireRuntime:['--verify','--run-http'].includes(step)});
 if(step==='--provision'&&local.ASSETTRUST_RUNTIME_DATABASE_URL)throw Error('RUNTIME_ROLE_ALREADY_PROVISIONED_DO_NOT_ROTATE');
 if(step==='--run-http'){
  for(const f of ['package-lock.json','apps/api/dist/main.js','apps/web/dist/index.html'])mustFile(path.join(root,f));
  if(!artifactsReady(root))throw Error('REVIEWED_LOCKFILE_AND_COMPILED_ARTIFACTS_REQUIRED');
 }
 // Deliberately skip dynamic/inherited credentials when invoking Docker.
 const safePath=env.PATH||process.env.PATH||'';
 const base={PATH:safePath,HOME:env.HOME||process.env.HOME||'',LANG:'C',CI:'true',NODE_ENV:'test'};
 const childEnv={...base,...local};
 const recipes={
  '--start':[['docker',['--host','unix:///var/run/docker.sock','compose','-f','compose.integration-v70.yaml','up','-d','--wait','postgres'],base]],
  '--start-scanner':[['docker',['--host','unix:///var/run/docker.sock','compose','-f','compose.integration-v70.yaml','--profile','scanner','up','-d','clamav'],base]],
  '--migrate':[['npm',['run','db:migrate'],childEnv],['npm',['run','db:check'],childEnv]],
  '--provision':[[process.execPath,['tools/provision-ci-runtime-role-v57.mjs'],{...childEnv,GITHUB_ENV:p.role}]],
  '--verify':[
   ['npm',['run','security:clamav:v52'],childEnv],
   ['npm',['run','db:check'],childEnv],
   ['npm',['run','test:pg:runtime-role:v57'],childEnv],
   ['npm',['run','test:pg:policy-contract:v63'],{...childEnv,ASSETTRUST_V63_POLICY_CONFIRM:'YES'}],
   ['npm',['run','test:pg:runtime-privileges:v60'],childEnv]
  ],
  '--run-http':[[process.execPath,['tools/ci-live-integration.mjs'],{...childEnv,
   ASSETTRUST_E2E_TARGET_ID:'assettrust-v70-supervisor-'+crypto.randomBytes(18).toString('hex'),
   ASSETTRUST_E2E_EXPECT_TARGET:null}]]
 };
 // Generate a compatible pre-run marker for the existing supervised runner.
 if(step==='--run-http'){
  const marker=recipes[step][0][2].ASSETTRUST_E2E_TARGET_ID;
  recipes[step][0][2].ASSETTRUST_E2E_EXPECT_TARGET=marker;
 }
 const steps=[];
 for(const [program,args,runEnv] of recipes[step]){
  const child=runner(program,args,{cwd:root,env:runEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],
   shell:false,timeout:step==='--run-http'?25*60*1000:step==='--start'?5*60*1000:3*60*1000,maxBuffer:3*1024*1024});
  if(child.status!==0||child.error||child.signal){
   return {schema:'ASSETTRUST_V70_LOCAL_EXECUTION',step,status:'FAILED',code:CODES[step],
    failedAt:steps.length+1,completedSteps:steps.length,productionApproved:false,
    // Do not persist or echo command output, which could contain credentials.
    details:'Inspect redacted logs locally; no stdout/stderr or configuration secrets are included in this report.'};
  }
  steps.push(program==='docker'?'disposable-postgis-started':args.join(' ').replace(/[^a-zA-Z0-9: -]/g,'').slice(0,90));
 }
 return {schema:'ASSETTRUST_V70_LOCAL_EXECUTION',step,status:'COMMANDS_PASSED_RELEASE_BLOCKED',
  completedSteps:steps.length,productionApproved:false,liveExecutionOccurred:true,
  note:'This runner is only a checkpoint. Full release requires the complete cross-project security gate.'};
}
function plan(){return {schema:'ASSETTRUST_V70_KALI_PLAN',productionApproved:false,databaseName:DB,
  isolatedFromLegacyCompose:true,port:'127.0.0.1:'+PORT,
  sequence:['--prepare (generate private settings, no database connection)','--start (isolated PostGIS service)',
   '--start-scanner (local ClamAV; may require signature downloads)',
   '--migrate (27 vetted source migrations)','--provision (separate non-bypass runtime login)',
   '--verify (DB ledger, restricted role and live policy inspection)',
   '--run-http (after authentic npm build: six authenticated/functional HTTP suites)'],
  safety:'Only local Unix Docker socket is permitted; never run against production, overwrite existing configuration or reuse test data for customer records.',
  status:'NOT_EXECUTED'};}
function main(args=process.argv.slice(2)){
 try{
  if(args.length!==1||!COMMANDS.includes(args[0]))throw Error('Choose exactly one supported v0.70 operation');
  const mode=args[0];
  const result=mode==='--plan'?plan():mode==='--doctor'?doctor():mode==='--prepare'?
   (process.env.ASSETTRUST_V70_LOCAL_CONFIRM==='YES'?prepare():(()=>{throw Error('LOCAL_DISPOSABLE_OPERATION_REQUIRES_EXPLICIT_CONFIRMATION')})()):run(mode);
  // Never serialize credentials or raw command output.
  console.log(JSON.stringify(result,null,2));
  if(result.status==='FAILED'||(mode==='--doctor'&&!result.preparedConfigurationValid))process.exitCode=1;
 }catch(e){console.error('BLOCKED: '+sanitize(e.message).replace(/[^A-Z0-9_]/g,'').slice(0,90));process.exitCode=1;}
}
if(require.main===module)main();
module.exports={ROOT,PORT,DB,COMMANDS,paths,uniqueSecrets,prepare,load,doctor,authorize,sanitize,run,plan,parseEnv,requireRoot,runtimeArtifactsReady};
