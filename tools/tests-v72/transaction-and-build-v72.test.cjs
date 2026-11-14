'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
function compile(rel,imports={}){
 const filename=path.join(ROOT,rel),mod={exports:{}};
 const javascript=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 vm.runInNewContext(javascript,{module:mod,exports:mod.exports,require:name=>{if(!(name in imports))throw Error('Unexpected import: '+name);return imports[name];},process,Error,Date,Promise}, {filename,timeout:5000});
 return mod.exports;
}
const limits=compile('apps/api/src/contexts/platform/domain/db-runtime-limits.ts').ONLINE_DATABASE_LIMITS;
const dec=()=>()=>{};
function dbFixture({fail={},scope}={}){
 const calls=[];let options,releaseResult;
 class Pool{
  constructor(value){options=value;}
  async connect(){return {query:async(sql,params)=>{
   calls.push({sql,params});if(fail[sql])throw fail[sql];
   return {rows:[{ok:true}],rowCount:1};},release:(discard)=>{releaseResult=discard;calls.push({sql:'RELEASE',discard});}};}
  async end(){}
 }
 const actor={setTenantScope:scope?.setTenantScope|| (async(tx,org)=>tx.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org])),setRecipientScope:scope?.setRecipientScope|| (async(tx,org,id)=>tx.query('ACTOR_SCOPE',[org,id]))};
 const Db=compile('apps/api/src/database.ts',{'@nestjs/common':{Global:dec,Injectable:dec,Module:dec},pg:{Pool},'./contexts/tenant-isolation/application/tenant-scope':actor,'./contexts/tenant-isolation/domain/rls-policy-contract':{PROTECTED_TABLES:[],inspectPolicyInventory:()=>({ok:true,actual:16})},'./contexts/platform/domain/db-runtime-limits':{ONLINE_DATABASE_LIMITS:limits}}).Database;
 const previous=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://synthetic:unit-only@127.0.0.1/assettrust_test';let instance;try{instance=new Db();}finally{if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}return {instance,calls,options,get release(){return releaseResult;}};
}
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'assettrust-v72-fixture-'));
 try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function buildFixture(root,version='0.72.0',withScript=true){
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'assettrust-platform',version,scripts:withScript?{'verify:v72':'node --test tools/tests-v72/*.test.cjs'}:{}}));
 // v85 build evidence also fingerprints all workspace manifests, not only
 // the root package. Even a mocked build fixture must model those inputs.
 for(const [sub,name] of [['apps/api','@assettrust/api'],['apps/web','@assettrust/web']]){
  const dir=path.join(root,sub);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,version}));
 }
 fs.writeFileSync(path.join(root,'package-lock.json'),'verified-fixture-only');
 const dir=path.join(root,'test-evidence/v68');fs.mkdirSync(dir,{recursive:true});
 return dir;
}
function fakeEvidence(root,version='0.72.0',steps=7){
 const ids=['lockfile','install','dependency-audit','compile','artifact-policy','milestone-regression','current-milestone-regression'];
 const entry={status:'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED',version,prerequisites:{ok:true},steps:ids.slice(0,steps).map(id=>({id,passed:true})),sourceManifestSha256:sha(path.join(root,'package.json')),lockfileSha256:sha(path.join(root,'package-lock.json'))};
 fs.writeFileSync(path.join(root,'test-evidence/v68/build-acceptance.json'),JSON.stringify(entry));return entry;
}
const build=require('../build-acceptance-v68.cjs');const accept=require('../kali-acceptance-v71.cjs');

test('v72 manifests, CI registration and all 27 reviewed migrations',()=>{
 const pkg=JSON.parse(read('package.json'));assert.match(pkg.version,/^0\.(?:7[2-9]|[89]\d|\d{3,})\.0$/);
 assert.equal(JSON.parse(read('apps/api/package.json')).version,pkg.version);assert.equal(JSON.parse(read('apps/web/package.json')).version,pkg.version);
 assert.equal(pkg.scripts['verify:v72'],'node --test tools/tests-v72/*.test.cjs');assert.equal(pkg.scripts['kali:acceptance:run:v72'],'node tools/kali-acceptance-v71.cjs --run');
 assert.match(read('.github/workflows/ci.yml'),/npm run verify:v72/);
 const sql=fs.readdirSync(path.join(ROOT,'apps/api/sql')).filter(f=>/^\d{3}_.*\.sql$/.test(f));assert.equal(sql.length,27);
});
test('bounded query/lock/idle/connection deadlines are configured and immutable',()=>{
 assert.equal(Object.isFrozen(limits),true);assert.deepEqual({...limits},{max:12,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:3000,idle_in_transaction_session_timeout:30000});
});
test('actual database Pool receives bounded settings and source connection URL',()=>{
 const f=dbFixture();assert.equal(f.options.max,12);assert.equal(f.options.statement_timeout,15000);assert.equal(f.options.query_timeout,20000);
 assert.equal(f.options.idle_in_transaction_session_timeout,30000);assert.equal(f.options.connectionString,'postgres://synthetic:unit-only@127.0.0.1/assettrust_test');
});
test('successful transaction commits and reuses safe connection',async()=>{
 const f=dbFixture();const result=await f.instance.transaction(tx=>tx.query('SELECT 1'));assert.equal(result.rows[0].ok,true);
 assert.deepEqual(f.calls.map(x=>x.sql),['BEGIN','SELECT 1','COMMIT','RELEASE']);assert.equal(f.release,false);
});
test('application query failure rolls back, original error retained, connection reused only after successful rollback',async()=>{
 const cause=Error('synthetic-data-failure');const f=dbFixture({fail:{'SELECT 1':cause}});
 await assert.rejects(f.instance.transaction(tx=>tx.query('SELECT 1')),e=>e===cause);
 assert.deepEqual(f.calls.map(x=>x.sql),['BEGIN','SELECT 1','ROLLBACK','RELEASE']);assert.equal(f.release,false);
});
test('failed rollback destroys connection and preserves original application error',async()=>{
 const cause=Error('original-business-failure');const f=dbFixture({fail:{'ROLLBACK':Error('secret rollback detail')}});
 await assert.rejects(f.instance.transaction(async()=>{throw cause;}),e=>e===cause);
 assert.deepEqual(f.calls.map(x=>x.sql),['BEGIN','ROLLBACK','RELEASE']);assert.equal(f.release,true);
});
test('failed COMMIT destroys connection even if ROLLBACK works',async()=>{
 const cause=Error('commit-unknown');const f=dbFixture({fail:{'COMMIT':cause}});
 await assert.rejects(f.instance.transaction(tx=>tx.query('SELECT 1')),e=>e===cause);
 assert.deepEqual(f.calls.map(x=>x.sql),['BEGIN','SELECT 1','COMMIT','ROLLBACK','RELEASE']);assert.equal(f.release,true);
});
test('failed COMMIT plus failed ROLLBACK preserves commit error and discards connection',async()=>{
 const cause=Error('commit-unknown');const f=dbFixture({fail:{'COMMIT':cause,'ROLLBACK':Error('separate rollback error')}});
 await assert.rejects(f.instance.transaction(tx=>tx.query('SELECT 1')),e=>e===cause);assert.equal(f.release,true);
});
test('failed BEGIN is never followed by business SQL; connection discarded',async()=>{
 const cause=Error('begin-failed');const f=dbFixture({fail:{'BEGIN':cause}});
 let invoked=false;await assert.rejects(f.instance.transaction(async()=>{invoked=true;}),e=>e===cause);
 assert.equal(invoked,false);assert.deepEqual(f.calls.map(x=>x.sql),['BEGIN','RELEASE']);assert.equal(f.release,true);
});
test('tenant scope remains transaction-local before a tenant read and commits safely',async()=>{
 const f=dbFixture();await f.instance.tenantQuery('synthetic-org','SELECT assets',[1]);
 assert.deepEqual(f.calls.map(x=>x.sql),['BEGIN',"SELECT set_config('assettrust.tenant_id',$1,true)",'SELECT assets','COMMIT','RELEASE']);
 assert.equal(f.calls[1].params[0],'synthetic-org');assert.equal(f.calls[2].params[0],1);
});
test('tenant scope failure cannot execute business query and discards connection on rollback failure',async()=>{
 const original=Error('set-scope-failed');const f=dbFixture({fail:{"SELECT set_config('assettrust.tenant_id',$1,true)":original,'ROLLBACK':Error('rollback-failed')}});
 await assert.rejects(f.instance.tenantQuery('synthetic-org','SELECT SECRET_DATA'),e=>e===original);
 assert(!f.calls.some(x=>x.sql==='SELECT SECRET_DATA'));assert.equal(f.release,true);
});
test('current-milestone build regression runs for v72 but does not weaken older v68 fixtures',()=>fixture(root=>{
 buildFixture(root);assert.deepEqual(build.milestoneStep(root),{id:'current-milestone-regression',command:'npm',args:['run','verify:v72']});
 buildFixture(root,'0.71.0');assert.equal(build.milestoneStep(root),null);
}));
test('v72 release build fails closed when current milestone test script is missing',()=>fixture(root=>{
 buildFixture(root,'0.72.0',false);assert.throws(()=>build.milestoneStep(root),/CURRENT_MILESTONE_REGRESSION_SCRIPT_REQUIRED/);
}));
test('build prerequisites reject v72 when current milestone regression cannot run',()=>fixture(root=>{
 buildFixture(root,'0.72.0',false);
 for(const d of ['apps/api','apps/web']){fs.mkdirSync(path.join(root,d),{recursive:true});fs.writeFileSync(path.join(root,d,'package.json'),JSON.stringify({version:'0.72.0'}));}
 const report=build.detect(root,{lockCheck:()=>({ok:true}),sourceCheck:()=>({ok:true}),migrationCheck:()=>({hashesMatch:true,sourceCount:27,manifestCount:27}),nodeVersion:'22.16.0'});
 assert.equal(report.ok,false);assert(report.issues.includes('CURRENT_MILESTONE_REGRESSION_SCRIPT_REQUIRED'));
}));
test('v72 build runner performs current regression after all original six gates',()=>fixture(root=>{
 buildFixture(root);const commands=[];
 const result=build.runAcceptance({root,env:{NODE_ENV:'test',ASSETTRUST_V68_BUILD_CONFIRM:'YES'},
  detectFn:()=>({ok:true,version:'0.72.0'}),runner:(command,args)=>{commands.push([command,...args].join(' '));return {status:0};},
  artifactsFn:()=>({ok:true,entries:{'apps/api/dist/main.js':{modifiedAtMs:Date.now()+1000},'apps/web/dist/index.html':{modifiedAtMs:Date.now()+1000}}})});
 assert.equal(result.status,'BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED');assert.equal(commands.length,7);
 assert.equal(commands[6],'npm run verify:v72');assert.equal(result.productionApproved,false);
}));
test('v71 supervisor recognizes a complete current v72 build evidence package',()=>fixture(root=>{
 buildFixture(root);fakeEvidence(root);assert.equal(accept.reviewBuildEvidence(root),true);
 assert.equal(accept.currentVersion(root),'0.72.0');assert.equal(accept.expectedBuildStages(root).length,7);
}));
test('v71 build evidence is rejected on v72 and absent current-regression step is rejected',()=>fixture(root=>{
 buildFixture(root);fakeEvidence(root,'0.71.0');assert.equal(accept.reviewBuildEvidence(root),false);
 fakeEvidence(root,'0.72.0',6);assert.equal(accept.reviewBuildEvidence(root),false);
}));
test('build provenance rejects modified source manifest and lockfile',()=>fixture(root=>{
 buildFixture(root);fakeEvidence(root);fs.appendFileSync(path.join(root,'package-lock.json'),'tampered');assert.equal(accept.reviewBuildEvidence(root),false);
}));
test('offline diagnostics remain read-only, secret-free and non-release',()=>{
 const diag=require('../runtime-db-diagnostics-v72.cjs');const result=diag.inspect();
 assert.equal(result.policyConfigured,true);assert.equal(result.liveDatabaseTested,false);assert.equal(result.productionApproved,false);
 assert.equal(result.releaseStatus,'NO_GO');assert(!JSON.stringify(result).includes('postgres://'));
 assert.equal(diag.plan().noDatabaseContact,true);
});
test('no SQL migration, tenant predicate or authentication guard was weakened',()=>{
 const db=read('apps/api/src/database.ts');assert(db.includes('inspectPolicyInventory(policies)'));
 assert(db.includes('relforcerowsecurity'));assert(db.includes('rolbypassrls'));
 assert(db.includes('setTenantScope(tx,organizationId)'));
 const guard=read('apps/api/src/auth.ts');assert(guard.includes('@UseGuards')||guard.includes('AuthGuard'));
});
test('v72 diagnostic CLI and local build inspection do not claim production approval',()=>{
 const {spawnSync}=require('node:child_process');const proc=spawnSync(process.execPath,['tools/runtime-db-diagnostics-v72.cjs','--inspect'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(proc.status,0);assert.equal(JSON.parse(proc.stdout).productionApproved,false);
 assert.equal(JSON.parse(proc.stdout).liveDatabaseTested,false);
});
