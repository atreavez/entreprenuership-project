/** v0.60: READ-ONLY post-provisioning privilege audit on a disposable DB. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
const {evaluateRuntimePrivileges}=require('./runtime-privilege-policy-v60.cjs');
// Guard all inputs BEFORE dynamically importing pg or connecting to any database.
if(process.env.CI!=='true' || process.env.NODE_ENV!=='test' ||
   process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')
 throw Error('BLOCKED: guarded, disposable CI runtime role validation required');
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))
 throw Error('BLOCKED: unexpected database name');
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v60-privilege-audit'});
await db.connect();
try{
 const {rows}=await db.query(`
 SELECT current_user AS role_name, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication,
  has_table_privilege(current_user,'public.assettrust_schema_migrations','SELECT') AS migration_read,
  has_any_column_privilege(current_user,'public.assettrust_schema_migrations','INSERT') AS migration_insert,
  has_any_column_privilege(current_user,'public.assettrust_schema_migrations','UPDATE') AS migration_update,
  has_table_privilege(current_user,'public.assettrust_schema_migrations','DELETE') AS migration_delete,
  has_table_privilege(current_user,'public.audit_events','SELECT') AS audit_read,
  has_table_privilege(current_user,'public.audit_events','INSERT') AS audit_insert,
  has_any_column_privilege(current_user,'public.audit_events','UPDATE') AS audit_update,
  has_table_privilege(current_user,'public.audit_events','DELETE') AS audit_delete,
  has_table_privilege(current_user,'public.assettrust_schema_migrations','TRUNCATE') AS migration_truncate,
  has_table_privilege(current_user,'public.audit_events','TRUNCATE') AS audit_truncate,
  has_table_privilege(current_user,'public.assettrust_schema_migrations','TRIGGER') AS migration_trigger,
  has_table_privilege(current_user,'public.audit_events','TRIGGER') AS audit_trigger,
  has_any_column_privilege(current_user,'public.assettrust_schema_migrations','REFERENCES') AS migration_references,
  has_any_column_privilege(current_user,'public.audit_events','REFERENCES') AS audit_references,
  EXISTS(SELECT 1 FROM pg_catalog.pg_class
   WHERE oid IN ('public.assettrust_schema_migrations'::regclass,'public.audit_events'::regclass)
     AND relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) AS protected_table_owner,
  has_schema_privilege(current_user,'public','CREATE') AS public_schema_create,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
  EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m
   WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) AS inherited_membership
 FROM pg_catalog.pg_roles WHERE rolname=current_user`);
 const flags=rows[0];
 if(flags?.role_name!==RUNTIME_ROLE)throw Error('Unexpected restricted runtime role');
 const result=evaluateRuntimePrivileges(flags);
 if(!result.ok)throw Error(result.issues.join('; '));
 // TRUNCATE is not subject to RLS. Column-level grants can bypass a table-only ACL check.
 const additional=['migration_truncate','audit_truncate','migration_trigger','audit_trigger',
  'migration_references','audit_references','protected_table_owner','rolreplication'];
 for(const key of additional){
  if(flags[key]!==false)throw Error('Runtime database privilege check failed: '+key);
 }
 console.log(JSON.stringify({schema:'ASSETTRUST_V60_RUNTIME_PRIVILEGE_AUDIT',ok:true,
  role:RUNTIME_ROLE,checks:result.checkedPrivileges+additional.length,readonly:true,productionApproved:false,
  disclaimer:'This CI login check does not prove tenant RLS on unprotected tables or production role permissions.'}));
}catch(e){console.error('FAIL v0.60 database privilege audit: '+e.message);process.exitCode=1;
}finally{await db.end();}
