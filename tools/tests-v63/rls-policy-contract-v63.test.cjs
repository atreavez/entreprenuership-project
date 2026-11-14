'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
// Exercise the real framework-independent application code, not a duplicate policy.
const ts=require('typescript');
const src=read('apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.equal(js.diagnostics.length,0);
const mod={exports:{}};new Function('module','exports',js.outputText)(mod,mod.exports);
const {POLICY_CONTRACT,PROTECTED_TABLES,canonicalPredicate,expectedPredicate,inspectPolicyInventory}=mod.exports;
const tenant="organization_id = (NULLIF(current_setting('assettrust.tenant_id'::text, true), ''::text))::uuid";
const recipient="("+tenant+") AND (recipient_id = (NULLIF(current_setting('assettrust.actor_id'::text, true), ''::text))::uuid)";
function catalog(p){return {tablename:p.table,policyname:p.name,cmd:p.cmd,permissive:'PERMISSIVE',roles:['public'],qual:p.read?(p.read==='tenant'?tenant:recipient):null,with_check:p.write?(p.write==='tenant'?tenant:recipient):null};}
function good(){return POLICY_CONTRACT.map(catalog);}
function replace(row,change){return good().map((x,i)=>i===row?{...x,...change}:x);}
const exact=(fn)=>{assert.equal(fn.ok,false);assert(fn.issues.length>0);};
test('reviewed policy inventory contains exactly 16 policies on 13 separate tables',()=>{assert.equal(POLICY_CONTRACT.length,16);assert.equal(PROTECTED_TABLES.length,13);assert.equal(new Set(POLICY_CONTRACT.map(x=>x.table+':'+x.name)).size,16);});
test('canonicalizer handles actual PostgreSQL pg_get_expr extra parentheses and casts',()=>{
 assert.equal(canonicalPredicate(tenant),expectedPredicate('tenant'));assert.equal(canonicalPredicate(recipient),expectedPredicate('recipient'));
 assert.equal(canonicalPredicate(null),null);
});
test('complete unchanged catalog from realistic PostgreSQL formatting passes',()=>{const x=inspectPolicyInventory(good());assert.deepEqual(x.issues,[]);assert(x.ok);});
test('missing tenant policy rejects startup',()=>exact(inspectPolicyInventory(good().slice(1))));
test('extra permissive policy rejects startup',()=>exact(inspectPolicyInventory([...good(),{...good()[0],policyname:'unsafe_allow_anyone'}])));
test('duplicate catalog key rejects startup',()=>exact(inspectPolicyInventory([...good(),good()[0]])));
test('policy command changed from ALL to SELECT rejects startup',()=>exact(inspectPolicyInventory(replace(0,{cmd:'SELECT'}))));
test('policy changed from PERMISSIVE to RESTRICTIVE rejects startup',()=>exact(inspectPolicyInventory(replace(0,{permissive:'RESTRICTIVE'}))));
test('policy role widened to unrestricted nonpublic actor rejects startup',()=>exact(inspectPolicyInventory(replace(0,{roles:['public','admin']}))));
test('policy role changed to organization admin only rejects startup',()=>exact(inspectPolicyInventory(replace(0,{roles:['admin']}))));
test('PostgreSQL array text response {public} also accepted',()=>{const a=good();a[0].roles='{public}';assert(inspectPolicyInventory(a).ok);});
test('qual changed to TRUE rejects startup',()=>exact(inspectPolicyInventory(replace(0,{qual:'true'}))));
test('qual altered by OR TRUE rejects startup',()=>exact(inspectPolicyInventory(replace(0,{qual:'('+tenant+') OR true'}))));
test('qual changed to a different tenant GUC rejects startup',()=>exact(inspectPolicyInventory(replace(0,{qual:tenant.replace('tenant_id','organization_id')}))));
test('WITH CHECK removed on writes rejects startup',()=>exact(inspectPolicyInventory(replace(0,{with_check:null}))));
test('INSERT policy unexpectedly adds a read condition rejects startup',()=>exact(inspectPolicyInventory(replace(8,{qual:tenant}))));
test('SELECT policy unexpectedly permits an INSERT check rejects startup',()=>exact(inspectPolicyInventory(replace(7,{with_check:tenant}))));
test('inbox SELECT missing recipient identity check rejects startup',()=>exact(inspectPolicyInventory(replace(13,{qual:tenant}))));
test('inbox UPDATE WITH CHECK missing recipient identity rejects startup',()=>exact(inspectPolicyInventory(replace(14,{with_check:tenant}))));
test('inbox UPDATE read authorization missing recipient identity rejects startup',()=>exact(inspectPolicyInventory(replace(14,{qual:tenant}))));
test('inbox INSERT broadens tenant insert by OR TRUE rejects startup',()=>exact(inspectPolicyInventory(replace(15,{with_check:tenant+' OR true'}))));
test('altered predicate using COALESCE rejects startup',()=>exact(inspectPolicyInventory(replace(0,{qual:tenant.replace('NULLIF','COALESCE')}))));
test('all 16 declared policies originate in committed SQL migrations',()=>{const migrations=fs.readdirSync(path.join(root,'apps/api/sql')).filter(x=>/^\d{3}_.*\.sql$/.test(x)).map(x=>read('apps/api/sql/'+x)).join('\n');for(const p of POLICY_CONTRACT)assert(migrations.includes('CREATE POLICY '+p.name+' ON public.'+p.table),p.name);});
test('the API checks policy catalog at startup when enforcing runtime-role security',()=>{const s=read('apps/api/src/database.ts');assert(s.includes('inspectPolicyInventory(policies)'));assert(s.includes("FROM pg_policies WHERE schemaname='public'"));assert(s.includes('if(!catalog.ok)throw new Error'));});
test('CI executes TypeScript-dependent policy test after installs and live PG test before tenant fixtures',()=>{const s=read('.github/workflows/ci.yml');assert(s.indexOf('npm run verify:v63')>s.indexOf('run: npm ci'));assert(s.indexOf('test:pg:policy-contract:v63')<s.indexOf('test:pg:operational-rls:v62'));});
test('supervised runner orders policy inventory before other tenant checks',()=>{const {dbSteps,assertDbTarget}=require('../release-validation-v51.cjs');const names=dbSteps(JSON.parse(read('package.json'))).map(x=>x.name);assert(names.indexOf('test:pg:runtime-role:v57')<names.indexOf('test:pg:policy-contract:v63'));assert(names.indexOf('test:pg:policy-contract:v63')<names.indexOf('test:pg:audit-rls:v61'));assert.throws(()=>assertDbTarget({}),/./);});
test('read-only live policy runner refuses unsafe execution before importing PostgreSQL driver',()=>{const proc=cp.spawnSync(process.execPath,['tools/test-pg-policy-contract-v63.mjs'],{cwd:root,env:{CI:'false',NODE_ENV:'test'},encoding:'utf8',timeout:4000});assert.notEqual(proc.status,0);assert.match(proc.stderr,/BLOCKED/);assert.doesNotMatch(proc.stderr,/password=|postgres:\/\//);});
test('new release is consistent across workspaces, no new SQL migration',()=>{for(const p of ['package.json','apps/api/package.json','apps/web/package.json'])assert.match(JSON.parse(read(p)).version,/^0\.(?:6[3-9]|[7-9]\d|\d{3,})\.0$/);assert.equal(fs.readdirSync(path.join(root,'apps/api/sql')).filter(x=>/^\d{3}_/.test(x)).length,27);});

test('pre-install CI does not execute TypeScript-dependent checks before npm ci',()=>{const ci=read('.github/workflows/ci.yml');const earlier=ci.slice(0,ci.indexOf('run: npm ci'));for(const v of ['v61','v62','v63'])assert(!earlier.includes('npm run verify:'+v));});

function productionDatabaseFixture(catalogRows){
 const vm=require('node:vm');
 const source=read('apps/api/src/database.ts');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 const calls=[];const decorator=()=>()=>{};
 class Pool{
  async query(sql){calls.push(sql);
   if(sql.includes('FROM pg_roles'))return {rows:[{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false}]};
   if(sql.includes('FROM pg_class'))return {rows:PROTECTED_TABLES.map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,table_owner:'migration_owner'}))};
   if(sql.includes('current_user AS runtime_role'))return {rows:[{runtime_role:'runtime_app'}]};
   if(sql.includes('FROM pg_policies'))return {rows:catalogRows};
   throw Error('Unexpected database query in startup fixture');
  }
  async end(){}
 }
 const module={exports:{}};const processStub={env:{DATABASE_URL:'postgres://fake:fake@127.0.0.1:5432/assettrust_ci',NODE_ENV:'production'}};
 const imports={
  '@nestjs/common':{Global:decorator,Injectable:decorator,Module:decorator},
  pg:{Pool},
  './contexts/platform/domain/db-runtime-limits':{ONLINE_DATABASE_LIMITS:{max:12,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:3000,idle_in_transaction_session_timeout:30000}},
  './contexts/tenant-isolation/domain/rls-policy-contract':mod.exports,
  './contexts/tenant-isolation/application/tenant-scope':{},
 };
 vm.runInNewContext(compiled,{module,exports:module.exports,require:name=>{if(!(name in imports))throw Error('Unexpected import '+name);return imports[name];},process:processStub,Error,Date,Promise}, {timeout:3000});
 return {instance:new module.exports.Database(),calls};
}
test('actual Database.onModuleInit accepts only a complete policy catalog in a fake PostgreSQL',async()=>{
 const fixture=productionDatabaseFixture(good());await fixture.instance.onModuleInit();assert.equal(fixture.calls.length,4);assert(fixture.calls[3].includes('FROM pg_policies'));
});
test('actual Database.onModuleInit rejects injected permissive policy and changed recipient check',async()=>{
 const fixture=productionDatabaseFixture([...good(),{...good()[0],policyname:'allow_everyone'}]);
 await assert.rejects(fixture.instance.onModuleInit(),/policy contract/);
 const changed=productionDatabaseFixture(replace(13,{qual:tenant}));
 await assert.rejects(changed.instance.onModuleInit(),/policy contract/);
});
