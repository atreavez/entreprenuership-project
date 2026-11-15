/** Read-only, fail-closed CI runtime-role contract, no fixtures created. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {REQUIRED_RLS_TABLES,RUNTIME_ROLE,validateRuntimeDatabaseUrls,evaluateDatabaseRole}=require('./runtime-role-policy-v57.cjs');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')
 throw Error('BLOCKED: supervised CI test mode with enforced runtime role required');
validateDisposablePgTarget(process.env);
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000});
await db.connect();
try{
 const {rows:identity}=await db.query('SELECT current_user AS name, rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user');
 const {rows:tables}=await db.query(`SELECT relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS table_owner
 FROM pg_class WHERE oid=ANY($1::regclass[])`,[REQUIRED_RLS_TABLES.map(name=>'public.'+name)]);
 const verdict=evaluateDatabaseRole({role:identity[0],tables},identity[0]?.name);
 if(!verdict.ok)throw Error(verdict.issues.join('; '));
 // No set_config, no tenant context: all protected tables should be invisible to this runtime role.
 for(const table of REQUIRED_RLS_TABLES){
  const {rows}=await db.query(`SELECT count(*)::int AS n FROM public.${table}`);
  if(rows[0].n!==0)throw Error('Unscoped API runtime read exposed tenant records: '+table);
 }
 console.log(JSON.stringify({schema:'ASSETTRUST_V57_RUNTIME_ROLE_CONTRACT',ok:true,role:RUNTIME_ROLE,rlsTablesChecked:REQUIRED_RLS_TABLES.length,unscopedReadsDenied:true,productionApproved:false}));
}finally{await db.end()}
