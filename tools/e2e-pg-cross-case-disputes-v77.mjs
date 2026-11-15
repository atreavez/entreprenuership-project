/**
 * v0.77 operator-run REAL PostgreSQL acceptance using the actual OperationsService
 * source transpiled into a disposable test host. This is NOT a browser/API test.
 * Synthetic records are committed only inside an explicitly authorized local
 * *_test/*_ci database; cleanup is attempted even when assertions fail.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const plan={schema:'ASSETTRUST_V77_PG_ACCEPTANCE_PLAN',status:'NOT_EXECUTED',productionApproved:false,
 target:'LOCAL_DISPOSABLE_POSTGRES_ONLY',checks:['same-asset cross-case open dispute preserves FLAGGED',
  'final unresolved dispute clears FLAGGED','simultaneous dispute creation and finalization serialize across cases',
  'synthetic record cleanup'],requires:['CI=true','NODE_ENV=test','ASSETTRUST_E2E_ALLOW_MUTATION=YES',
  'ASSETTRUST_V77_PG_CONFIRM=YES','operator DATABASE_URL localhost assettrust_ci/assettrust_test',
  'separate restricted ASSETTRUST_RUNTIME_DATABASE_URL','genuine installed dependencies and applied SQL migrations']};
if(process.argv.length!==3||!['--plan','--run'].includes(process.argv[2])){
 console.error('Use --plan or --run');process.exit(2);
}
if(process.argv[2]==='--plan'){console.log(JSON.stringify(plan,null,2));process.exit(0);}
// No network, imports of database libraries, or database mutations until ALL guards pass.
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||
 process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||process.env.ASSETTRUST_V77_PG_CONFIRM!=='YES'){
 console.error('BLOCKED: Explicit disposable integration authorization required');process.exit(1);
}
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
let target;
try{
 target=validateDisposablePgTarget(process.env);
 if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('Only AssetTrust disposable DB names allowed');
}catch{console.error('BLOCKED: Unsafe database target');process.exit(1);}
// Separate the privileged disposable-fixture operator from the restricted
// runtime role that exercises the actual application service logic.
const runtimeUri=process.env.ASSETTRUST_RUNTIME_DATABASE_URL;
let runtimeTarget;
try{
 runtimeTarget=validateDisposablePgTarget({...process.env,DATABASE_URL:runtimeUri});
 if(runtimeTarget.databaseName!==target.databaseName)throw Error('DB mismatch');
 const a=new URL(process.env.DATABASE_URL),b=new URL(runtimeUri);
 if(a.hostname!==b.hostname||a.port!==b.port||a.username===b.username||b.search||b.hash)throw Error('Runtime role not separate');
}catch{console.error('BLOCKED: Independent restricted runtime URL required');process.exit(1);}
const {default:pg}=await import('pg');
const {default:ts}=await import('typescript');
const {default:argon2}=await import('argon2');
const nonLoginPasswordHash=await argon2.hash(randomUUID(),{type:argon2.argon2id});
class ForbiddenException extends Error{} class NotFoundException extends Error{}
class BadRequestException extends Error{} class ConflictException extends Error{}
const captures={};const dec=()=>()=>{};
const nest={Controller:dec,Get:dec,Post:dec,Patch:dec,Param:dec,Body:dec,Req:dec,UseGuards:dec,Module:dec,
 Injectable:()=>target=>{if(target.name==='OperationsService')captures.OperationsService=target;},
 ForbiddenException,NotFoundException,ConflictException,BadRequestException};
function loadSource(relative,imports){
 const filename=join(root,relative);
 const transpiled=ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(transpiled,{module:mod,exports:mod.exports,require:id=>{
  if(!Object.hasOwn(imports,id))throw Error('Unexpected source dependency');return imports[id];
 },process,Date,Promise,Error,Buffer,console},{timeout:3000,filename});
 return mod.exports;
}
const policy=loadSource('apps/api/src/contexts/access/infrastructure/transactional-access.ts',{'@nestjs/common':nest});
const common={uid:randomUUID,isUuid:v=>{
 if(typeof v!=='string'||!/^[a-f0-9-]{36}$/i.test(v))throw new BadRequestException('Invalid id');return v;
},text:(v)=>{if(typeof v!=='string'||!v.trim())throw new BadRequestException();return v.trim()},
 optionalText:v=>v??null,enumValue:(v,options)=>{if(!options.includes(v))throw new BadRequestException();return v},
 assertRole:(u,roles)=>{if(!roles.includes(u.role))throw new ForbiddenException()}};
loadSource('apps/api/src/operations.ts',{'@nestjs/common':nest,'./database':{Database:class{}},
 './audit':{AuditModule:class{},AuditService:class{}},'./auth':{AuthModule:class{},AuthGuard:class{}},
 './access':{AccessModule:class{},AccessService:class{}},'./common':common,
 './contexts/tenant-isolation/application/tenant-scope':{setTenantScope:(tx,id)=>tx.query("SELECT set_config('assettrust.tenant_id',$1,true)",[id])},
 './contexts/access/infrastructure/transactional-access':policy});
assert(captures.OperationsService,'Actual OperationsService source not loaded');
const operatorPool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,
 idleTimeoutMillis:5000,application_name:'assettrust-v77-fixture-operator'});
const runtimePool=new pg.Pool({connectionString:runtimeUri,max:4,connectionTimeoutMillis:5000,
 idleTimeoutMillis:5000,application_name:'assettrust-v77-restricted-service'});
async function transactOn(pool,fn){
 const conn=await pool.connect();let inTx=false;
 try{await conn.query('BEGIN');inTx=true;
  await conn.query("SET LOCAL statement_timeout='15s'");
  await conn.query("SET LOCAL lock_timeout='8s'");
  const result=await fn(conn);await conn.query('COMMIT');inTx=false;return result;
 }catch(err){if(inTx)try{await conn.query('ROLLBACK')}catch{}throw err}
 finally{conn.release();}
}
const transactRuntime=fn=>transactOn(runtimePool,fn);
const transactOperator=fn=>transactOn(operatorPool,fn);
const fixture={org:randomUUID(),actor:randomUUID(),asset:randomUUID(),cases:[randomUUID(),randomUUID()],
 disputes:[randomUUID(),randomUUID()]};
const user={id:fixture.actor,organizationId:fixture.org,role:'ORG_ADMIN'};
const db={transaction:transactRuntime,tenantQuery:async()=>{throw Error('Not part of this acceptance')}};
const svc=new captures.OperationsService(db,{write:async()=>{}},{case:async()=>{}});
async function snapshot(){return transactRuntime(async conn=>{
 await conn.query("SELECT set_config('assettrust.tenant_id',$1,true)",[fixture.org]);
 const a=(await conn.query('SELECT status FROM assets WHERE id=$1',[fixture.asset])).rows[0]?.status;
 const c=(await conn.query('SELECT status FROM verification_cases WHERE id=ANY($1::uuid[]) ORDER BY id',[fixture.cases])).rows.map(x=>x.status);
 const pending=Number((await conn.query(`SELECT count(*)::int AS n FROM disputes d JOIN verification_cases c
  ON c.id=d.case_id AND c.organization_id=d.organization_id WHERE c.asset_id=$1
  AND d.status IN ('OPEN','INVESTIGATING')`,[fixture.asset])).rows[0].n);
 return {asset:a,cases:c,pending};
});}
let seeded=false,checks=0,failed=false;
try{
 await transactRuntime(async conn=>{
  const role=(await conn.query(`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
  assert(role&&!role.rolsuper&&!role.rolbypassrls,'Cannot run against superuser/BYPASSRLS');
  assert.equal((await conn.query('SELECT current_database() AS name')).rows[0].name,target.databaseName);
  checks+=2;
 });
 await transactOperator(async conn=>{
  const migrations=(await conn.query('SELECT count(*)::int AS n FROM assettrust_schema_migrations')).rows[0].n;
  assert(migrations>=27,'All reviewed schema migrations must already be applied');
  checks++;
 });
 await transactOperator(async conn=>{
  await conn.query("SELECT set_config('assettrust.tenant_id',$1,true)",[fixture.org]);
  await conn.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[fixture.org,'v77 synthetic isolated organization']);
  await conn.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,$3,$4,$5,'ORG_ADMIN')`,[fixture.actor,fixture.org,'Synthetic dispute operator',`assettrust-${randomUUID()}@example.invalid`,nonLoginPasswordHash]);
  await conn.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,status,created_by)
   VALUES($1,$2,$3,'LAND','synthetic','synthetic','FLAGGED',$4)`,[fixture.asset,fixture.org,`V77-${fixture.asset}` ,fixture.actor]);
  for(let i=0;i<2;i++){
   await conn.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,status)
    VALUES($1,$2,$3,$4,$5,'BLOCKED')`,[fixture.cases[i],fixture.org,`V77-${fixture.cases[i]}`,fixture.asset,fixture.actor]);
   await conn.query(`INSERT INTO disputes(id,organization_id,case_id,category,description,reported_by)
    VALUES($1,$2,$3,'DOCUMENT','Synthetic dispute scenario',$4)`,[fixture.disputes[i],fixture.org,fixture.cases[i],fixture.actor]);
  }
 });seeded=true;
 await svc.resolveDispute(user,fixture.disputes[0],{status:'RESOLVED',resolution:'Synthetic acceptance'});
 let snap=await snapshot();assert.equal(snap.asset,'FLAGGED');assert.equal(snap.pending,1);checks+=2;
 await svc.resolveDispute(user,fixture.disputes[1],{status:'RESOLVED',resolution:'Synthetic acceptance'});
 snap=await snapshot();assert.equal(snap.asset,'IN_REVIEW');assert.equal(snap.pending,0);checks+=2;
 const [one,two]=await Promise.all(fixture.cases.map(caseId=>svc.raiseDispute(user,{caseId,category:'DOCUMENT',description:'Synthetic concurrent report'})));
 snap=await snapshot();assert.equal(snap.asset,'FLAGGED');assert.equal(snap.pending,2);checks+=2;
 await Promise.all([svc.resolveDispute(user,one.id,{status:'RESOLVED',resolution:'Synthetic closure 1'}),
  svc.resolveDispute(user,two.id,{status:'REJECTED',resolution:'Synthetic closure 2'})]);
 snap=await snapshot();assert.equal(snap.asset,'IN_REVIEW');assert.equal(snap.pending,0);checks+=2;
 console.log(JSON.stringify({schema:'ASSETTRUST_V77_REAL_PG_RESULT',status:'PASSED',checks,
  target:'LOCAL_DISPOSABLE_POSTGRES_ONLY',productionApproved:false,releaseStatus:'NO_GO'}));
}catch(error){failed=true;
 console.error(JSON.stringify({schema:'ASSETTRUST_V77_REAL_PG_RESULT',status:'FAILED',checks,
  failureCategory:error?.code?.slice(0,5)||error?.name||'UNKNOWN',productionApproved:false,releaseStatus:'NO_GO'}));
}finally{
 if(seeded){
  try{await transactOperator(async conn=>{
   await conn.query("SELECT set_config('assettrust.tenant_id',$1,true)",[fixture.org]);
   for(const table of ['notifications','disputes','case_tasks','monitoring_reminders','verification_quotes'])
    await conn.query(`DELETE FROM ${table} WHERE organization_id=$1`,[fixture.org]);
   await conn.query('DELETE FROM verification_cases WHERE organization_id=$1',[fixture.org]);
   await conn.query('DELETE FROM assets WHERE organization_id=$1',[fixture.org]);
   await conn.query('DELETE FROM users WHERE organization_id=$1',[fixture.org]);
   await conn.query('DELETE FROM organizations WHERE id=$1',[fixture.org]);
  });}catch{failed=true;console.error('CLEANUP_FAILED: isolated synthetic records require manual review');}
 }
 await Promise.all([runtimePool.end(),operatorPool.end()]);
}
if(failed)process.exitCode=1;
