/** Read-only live PostgreSQL policy verification, release v0.63.
 * Must use the independent restricted API role on a disposable local DB.
 * Never prints any database URL/password. Requires built API policy module.
 */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function main(env=process.env){
 if(env.CI!=='true'||env.NODE_ENV!=='test'||env.ASSETTRUST_V63_POLICY_CONFIRM!=='YES')
  throw Error('Disposable CI/test mode and explicit v0.63 RLS policy confirmation required');
 const {validateRuntimeDatabaseUrls,evaluateDatabaseRole,REQUIRED_RLS_TABLES,RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
 validateRuntimeDatabaseUrls(env.DATABASE_URL,env.ASSETTRUST_RUNTIME_DATABASE_URL);
 const {inspectPolicyInventory,PROTECTED_TABLES}=require(resolve(ROOT,'apps/api/dist/contexts/tenant-isolation/domain/rls-policy-contract.js'));
 const {Client}=require('pg');
 const db=new Client({connectionString:env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000});
 await db.connect();
 try{
  await db.query('BEGIN READ ONLY');
  const role=(await db.query('SELECT current_user AS role')).rows[0].role;
  const flags=(await db.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
  const relations=await db.query(`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS table_owner
    FROM pg_class WHERE oid=ANY($1::regclass[])`,[PROTECTED_TABLES.map(name=>'public.'+name)]);
  const checked=evaluateDatabaseRole({role:flags,tables:relations.rows},role);
  if(role!==RUNTIME_ROLE||!checked.ok||PROTECTED_TABLES.length!==REQUIRED_RLS_TABLES.length)
   throw Error('Runtime PostgreSQL privileges or protected table inventory mismatch');
  const result=await db.query(`SELECT tablename,policyname,cmd,permissive,roles,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND tablename=ANY($1::text[])`,[PROTECTED_TABLES]);
  const report=inspectPolicyInventory(result.rows);
  if(!report.ok)throw Error('Policy contract failed ('+report.issues.length+' policy issues; no sensitive predicate contents printed)');
  await db.query('ROLLBACK');
  return {schema:'ASSETTRUST_V63_LIVE_POLICY_CONTRACT',ok:true,productionApproved:false,checkedPolicies:report.expected,protectedTables:PROTECTED_TABLES.length,checkedAs:'restricted-runtime-role',notice:'Live database contract passed; deployment release gate remains separate'};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
 finally{await db.end().catch(()=>{});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await main(),null,2));}catch(e){console.error('BLOCKED: '+e.message);process.exitCode=1;}
}
export {main};
