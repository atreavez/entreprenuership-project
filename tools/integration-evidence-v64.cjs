'use strict';
/** AssetTrust v0.64: evidence-driven, guarded local integration checkpoint.
 * Never grants a release approval. Does not bootstrap credentials, install a DB,
 * run against remote databases, or weaken v51-v63 safety confirmations.
 */
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {assertDbTarget} = require('./release-validation-v51.cjs');
const {validateRuntimeDatabaseUrls} = require('./runtime-role-policy-v57.cjs');
const ROOT=path.resolve(__dirname,'..');
const MODES=Object.freeze(['--plan','--inspect','--build','--database','--all']);
const EVIDENCE=path.join('test-evidence','v64');
const COMMANDS=Object.freeze({
 build:{label:'full source, dependency, build, tests, and evidence gates',args:['run','release:validate:v51']},
 database:{label:'supervised disposable PostgreSQL and HTTP integration',args:['run','release:database:v51']}
});
function parseMode(args){
 if(args.length!==1||!MODES.includes(args[0]))throw Error('Specify exactly one of --plan, --inspect, --build, --database, --all');
 return args[0];
}
function sha(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function fileExistsRegular(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
function rootCheck(root){
 const files=['package.json','apps/api/package.json','apps/web/package.json'];
 if(!files.every(x=>fileExistsRegular(path.join(root,x))))throw Error('Expected AssetTrust monorepo manifests are missing or linked');
 const main=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(main.name!=='assettrust-platform'||!main.scripts?.['release:validate:v51']||!main.scripts?.['release:database:v51'])
  throw Error('This is not a compatible AssetTrust milestone source checkout');
 return main;
}
function inspect(root=ROOT,env=process.env){
 const p=rootCheck(root);
 const lock=path.join(root,'package-lock.json');
 const checks={
  genuineLockfilePresent:fileExistsRegular(lock),
  apiBuildPresent:fileExistsRegular(path.join(root,'apps/api/dist/main.js')),
  webBuildPresent:fileExistsRegular(path.join(root,'apps/web/dist/index.html')),
  originalGitHistoryPresent:fs.existsSync(path.join(root,'.git')),
  disposableDatabaseConfigured:Boolean(env.DATABASE_URL&&env.ASSETTRUST_RUNTIME_DATABASE_URL),
  clamavConfigured:Boolean(env.CLAMAV_TCP_PORT||env.CLAMAV_SOCKET),
 };
 const blocked=[];
 if(!checks.genuineLockfilePresent)blocked.push('Generate and review an authentic npm lockfile on trusted connected Kali; do not fabricate one');
 if(!checks.apiBuildPresent||!checks.webBuildPresent)blocked.push('Run npm ci, audit and full API/web build before database/HTTP tests');
 if(!checks.originalGitHistoryPresent)blocked.push('Scan the original Git repository history, not only the source archive');
 if(!checks.disposableDatabaseConfigured)blocked.push('Configure operator and restricted runtime logins to the SAME loopback disposable database');
 return {schema:'ASSETTRUST_V64_INTEGRATION_INSPECTION',version:p.version,productionApproved:false,node:process.versions.node,
  sourceManifestSha256:sha(path.join(root,'package.json')),lockfileSha256:checks.genuineLockfilePresent?sha(lock):null,checks,blocked};
}
function authorizeDatabase(root=ROOT,env=process.env){
 if(!fileExistsRegular(path.join(root,'apps/api/dist/main.js'))||!fileExistsRegular(path.join(root,'apps/web/dist/index.html')))
  throw Error('Both API and browser builds required before supervised integration');
 const target=assertDbTarget(env); // v51 requires all prior explicit disposable/tenant/role confirmations
 const urls=validateRuntimeDatabaseUrls(env.DATABASE_URL,env.ASSETTRUST_RUNTIME_DATABASE_URL);
 if(env.NODE_ENV!=='test'||env.CI!=='true')throw Error('Only CI=true NODE_ENV=test supported');
 if(env.ASSETTRUST_V64_DB_CONFIRM!==target.databaseName)throw Error('Set ASSETTRUST_V64_DB_CONFIRM to the exact disposable database name');
 if(!['assettrust_ci','assettrust_test'].includes(target.databaseName)||urls.database!==target.databaseName)
  throw Error('Unexpected database identity');
 return {databaseName:target.databaseName,loopback:true,runtimeRoleChecked:true};
}
function plan(mode){
 const all=['build','database'];
 const sequence=mode==='--all'?all:mode==='--build'?['build']:mode==='--database'?['database']:all;
 return {schema:'ASSETTRUST_V64_EXECUTION_PLAN',productionApproved:false,mode,steps:sequence.map(key=>({name:key,
  label:COMMANDS[key].label,command:['npm',...COMMANDS[key].args].join(' ')})),
  safety:'Database validation is MUTATING and requires all v51-v63 opt-ins, separate non-owner role, two loopback credentials and v64 exact-name confirmation.',
  gate:'No run here grants production release approval.'};
}
function safeExcerpt(value,env=process.env){
 let text=String(value||'').replace(/\x1b\[[0-9;]*m/g,'');
 const names=Object.keys(env).filter(k=>/(?:SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|PEPPER|ENCRYPTION_KEY|API_KEY|CREDENTIAL)/i.test(k));
 for(const key of names){const secret=String(env[key]||'');if(secret.length>=8)text=text.split(secret).join('[REDACTED]');}
 return text.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi,'[REDACTED_DB_URL]')
  .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=:-]+/gi,'[REDACTED_AUTHORIZATION]')
  .replace(/\b(?:DATABASE_URL|ASSETTRUST_RUNTIME_DATABASE_URL|JWT_SECRET|MFA_ENCRYPTION_KEY|LOGIN_ABUSE_PEPPER|PASSWORD|TOKEN|API_KEY)\s*[:=]\s*[^\s,;]+/gi,'[REDACTED_SETTING]')
  .replace(/\b(?:https?:\/\/)[^\s]*@[^\s]+/gi,'[REDACTED_URL]')
  .slice(-4500);
}
function evidenceFile(root=ROOT){return path.join(root,EVIDENCE,'integration-summary.json');}
function saveEvidence(root,obj){
 const components=[path.join(root,'test-evidence'),path.join(root,EVIDENCE)];
 for(const dir of components){
  if(fs.existsSync(dir)&&(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink()))throw Error('Refusing unsafe evidence directory');
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:false,mode:0o700});
 }
 const file=evidenceFile(root);
 if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw Error('Refusing linked/non-regular evidence output');
 fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{encoding:'utf8',flag:'w',mode:0o600});
 fs.chmodSync(file,0o600);
}
function loadV51Step(root,started){
 const p=path.join(root,'test-evidence','v51','local-validation-summary.json');
 if(!fileExistsRegular(p)||fs.statSync(p).mtimeMs<started-1000)return null;
 try{const data=JSON.parse(fs.readFileSync(p,'utf8'));const last=data.steps?.at(-1);
  if(!last||typeof last.name!=='string')return null;
  return {lastStep:last.name.replace(/[^-a-zA-Z0-9_]/g,'').slice(0,80),stepOk:last.ok===true,stepsCount:data.steps?.length||0};
 }catch{return null;}
}
function execute(mode,{root=ROOT,env=process.env,runner=spawnSync,clock=Date.now}={}){
 if(!MODES.includes(mode))throw Error('Unsupported mode');
 const planData=plan(mode);
 if(mode==='--plan')return {status:'PLAN_ONLY',...planData};
 const current=inspect(root,env);
 if(mode==='--inspect')return {status:'INSPECTION_ONLY',...current};
 const results={schema:'ASSETTRUST_V64_RUN',version:current.version,mode,productionApproved:false,status:'BLOCKED',
  sourceManifestSha256:current.sourceManifestSha256,lockfileSha256:current.lockfileSha256,
  steps:[],issues:[],releaseBlockers:['No independent production security certification','No proven real-world deployment/restore/security approval']};
 if(!current.checks.genuineLockfilePresent){results.issues.push('Genuine reviewed package-lock.json required');return results;}
 if(mode==='--database'){
  try{results.target=authorizeDatabase(root,env)}catch(e){results.issues.push(String(e.message));return results;}
 }
 const steps=mode==='--all'?['build','database']:mode==='--build'?['build']:['database'];
 for(const key of steps){
  if(key==='database' && mode==='--all'){
   try{results.target=authorizeDatabase(root,env)}catch(e){
    results.issues.push(String(e.message));results.status='BLOCKED';saveEvidence(root,results);return results;
   }
  }
  const started=clock();const child=runner('npm',COMMANDS[key].args,{cwd:root,env,encoding:'utf8',
   stdio:['ignore','pipe','pipe'],timeout:60*60*1000,maxBuffer:32*1024*1024,shell:false});
  const passed=child.status===0&&!child.error&&!child.signal;
  const step={name:key,command:['npm',...COMMANDS[key].args].join(' '),passed,exitCode:child.status??null,
   durationMs:Math.max(0,clock()-started),detail:loadV51Step(root,started)};
  results.steps.push(step);
  if(!passed){
   results.issues.push(`${key} integration did not pass; see sanitized failure excerpt on trusted machine`);
   results.failureExcerpt=safeExcerpt([child.stdout,child.stderr,child.error?.message].filter(Boolean).join('\n'),env);
   break;
  }
 }
 results.status=results.issues.length?'FAILED':'INTEGRATION_COMMANDS_PASSED_RELEASE_STILL_BLOCKED';
 saveEvidence(root,results);
 return results;
}
function main(argv=process.argv.slice(2)){
 try{
  const mode=parseMode(argv),out=execute(mode);
  // Do not echo the potentially sensitive failure excerpt; it is stored locally only.
  const publicOutput={...out};delete publicOutput.failureExcerpt;
  console.log(JSON.stringify(publicOutput,null,2));
  if(out.status==='FAILED'||out.status==='BLOCKED')process.exitCode=1;
 }catch(e){console.error('BLOCKED: '+safeExcerpt(e.message));process.exitCode=1;}
}
if(require.main===module)main();
module.exports={parseMode,inspect,authorizeDatabase,plan,safeExcerpt,evidenceFile,saveEvidence,execute,main};
