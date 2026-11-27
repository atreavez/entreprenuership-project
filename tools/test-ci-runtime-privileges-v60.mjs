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
  has_any_column_privilege(current_user,'public.anchor_job_history','UPDATE') AS anchor_job_history_update,
  has_table_privilege(current_user,'public.anchor_job_history','DELETE') AS anchor_job_history_delete,
  has_table_privilege(current_user,'public.anchor_job_history','TRUNCATE') AS anchor_job_history_truncate,
  has_table_privilege(current_user,'public.anchor_job_history','TRIGGER') AS anchor_job_history_trigger,
  has_any_column_privilege(current_user,'public.anchor_job_history','REFERENCES') AS anchor_job_history_references,
  has_table_privilege(current_user,'public.anchor_jobs','DELETE') AS anchor_jobs_delete,
  has_table_privilege(current_user,'public.anchor_jobs','TRUNCATE') AS anchor_jobs_truncate,
  has_table_privilege(current_user,'public.anchor_jobs','TRIGGER') AS anchor_jobs_trigger,
  has_any_column_privilege(current_user,'public.anchor_jobs','REFERENCES') AS anchor_jobs_references,
  has_table_privilege(current_user,'public.billing_catalog_versions','DELETE') AS billing_catalog_versions_delete,
  has_table_privilege(current_user,'public.billing_catalog_versions','TRUNCATE') AS billing_catalog_versions_truncate,
  has_table_privilege(current_user,'public.billing_catalog_versions','TRIGGER') AS billing_catalog_versions_trigger,
  has_any_column_privilege(current_user,'public.billing_catalog_versions','REFERENCES') AS billing_catalog_versions_references,
  has_any_column_privilege(current_user,'public.billing_catalog_versions','UPDATE') AS billing_catalog_versions_update,
  has_table_privilege(current_user,'public.billing_invoices','DELETE') AS billing_invoices_delete,
  has_table_privilege(current_user,'public.billing_invoices','TRUNCATE') AS billing_invoices_truncate,
  has_table_privilege(current_user,'public.billing_invoices','TRIGGER') AS billing_invoices_trigger,
  has_any_column_privilege(current_user,'public.billing_invoices','REFERENCES') AS billing_invoices_references,
  has_table_privilege(current_user,'public.billing_journal','DELETE') AS billing_journal_delete,
  has_table_privilege(current_user,'public.billing_journal','TRUNCATE') AS billing_journal_truncate,
  has_table_privilege(current_user,'public.billing_journal','TRIGGER') AS billing_journal_trigger,
  has_any_column_privilege(current_user,'public.billing_journal','REFERENCES') AS billing_journal_references,
  has_any_column_privilege(current_user,'public.billing_journal','UPDATE') AS billing_journal_update,
  has_table_privilege(current_user,'public.billing_settlements','DELETE') AS billing_settlements_delete,
  has_table_privilege(current_user,'public.billing_settlements','TRUNCATE') AS billing_settlements_truncate,
  has_table_privilege(current_user,'public.billing_settlements','TRIGGER') AS billing_settlements_trigger,
  has_any_column_privilege(current_user,'public.billing_settlements','REFERENCES') AS billing_settlements_references,
  has_any_column_privilege(current_user,'public.billing_settlements','UPDATE') AS billing_settlements_update,
  has_any_column_privilege(current_user,'public.billing_settlements','INSERT') AS billing_settlements_insert,
  has_table_privilege(current_user,'public.billing_subscriptions','DELETE') AS billing_subscriptions_delete,
  has_table_privilege(current_user,'public.billing_subscriptions','TRUNCATE') AS billing_subscriptions_truncate,
  has_table_privilege(current_user,'public.billing_subscriptions','TRIGGER') AS billing_subscriptions_trigger,
  has_any_column_privilege(current_user,'public.billing_subscriptions','REFERENCES') AS billing_subscriptions_references,
  has_any_column_privilege(current_user,'public.billing_subscriptions','UPDATE') AS billing_subscriptions_update,
  has_column_privilege(current_user,'public.billing_invoices','id','UPDATE') AS invoice_id_update,
  has_column_privilege(current_user,'public.billing_invoices','organization_id','UPDATE') AS invoice_organization_id_update,
  has_column_privilege(current_user,'public.billing_invoices','catalog_version','UPDATE') AS invoice_catalog_version_update,
  has_column_privilege(current_user,'public.billing_invoices','lines','UPDATE') AS invoice_lines_update,
  has_column_privilege(current_user,'public.billing_invoices','total_ugx','UPDATE') AS invoice_total_ugx_update,
  has_column_privilege(current_user,'public.billing_invoices','currency','UPDATE') AS invoice_currency_update,
  has_column_privilege(current_user,'public.billing_invoices','payment_key','UPDATE') AS invoice_payment_key_update,
  has_column_privilege(current_user,'public.billing_invoices','created_at','UPDATE') AS invoice_created_at_update,
  has_column_privilege(current_user,'public.billing_invoices','currency','INSERT') AS invoice_currency_insert,
  has_column_privilege(current_user,'public.billing_invoices','state','INSERT') AS invoice_state_insert,
  has_column_privilege(current_user,'public.billing_invoices','revision','INSERT') AS invoice_revision_insert,
  has_column_privilege(current_user,'public.billing_invoices','payment_key','INSERT') AS invoice_payment_key_insert,
  has_column_privilege(current_user,'public.billing_invoices','created_at','INSERT') AS invoice_created_at_insert,
  has_table_privilege(current_user,'public.billing_reconciliation_jobs','DELETE') AS billing_reconciliation_jobs_delete,
  has_table_privilege(current_user,'public.billing_reconciliation_jobs','TRUNCATE') AS billing_reconciliation_jobs_truncate,
  has_table_privilege(current_user,'public.billing_reconciliation_jobs','TRIGGER') AS billing_reconciliation_jobs_trigger,
  has_any_column_privilege(current_user,'public.billing_reconciliation_jobs','REFERENCES') AS billing_reconciliation_jobs_references,
  has_any_column_privilege(current_user,'public.billing_reconciliation_jobs','INSERT') AS billing_reconciliation_jobs_insert,
  has_table_privilege(current_user,'public.billing_reconciliation_history','DELETE') AS billing_reconciliation_history_delete,
  has_table_privilege(current_user,'public.billing_reconciliation_history','TRUNCATE') AS billing_reconciliation_history_truncate,
  has_table_privilege(current_user,'public.billing_reconciliation_history','TRIGGER') AS billing_reconciliation_history_trigger,
  has_any_column_privilege(current_user,'public.billing_reconciliation_history','REFERENCES') AS billing_reconciliation_history_references,
  has_any_column_privilege(current_user,'public.billing_reconciliation_history','UPDATE') AS billing_reconciliation_history_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','id','UPDATE') AS reconciliation_id_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','organization_id','UPDATE') AS reconciliation_organization_id_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','invoice_id','UPDATE') AS reconciliation_invoice_id_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','provider_id','UPDATE') AS reconciliation_provider_id_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','transaction_id','UPDATE') AS reconciliation_transaction_id_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','policy','UPDATE') AS reconciliation_policy_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','lease_token','UPDATE') AS reconciliation_lease_token_update,
  has_column_privilege(current_user,'public.billing_reconciliation_jobs','lease_until','UPDATE') AS reconciliation_lease_until_update,
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
  'migration_references','audit_references','protected_table_owner','rolreplication','anchor_job_history_update','anchor_job_history_delete','anchor_job_history_truncate','anchor_job_history_trigger','anchor_job_history_references','anchor_jobs_delete','anchor_jobs_truncate','anchor_jobs_trigger','anchor_jobs_references','public_schema_create','database_create','inherited_membership','billing_catalog_versions_delete','billing_catalog_versions_truncate','billing_catalog_versions_trigger','billing_catalog_versions_references','billing_catalog_versions_update','billing_invoices_delete','billing_invoices_truncate','billing_invoices_trigger','billing_invoices_references','billing_journal_delete','billing_journal_truncate','billing_journal_trigger','billing_journal_references','billing_journal_update','billing_settlements_delete','billing_settlements_truncate','billing_settlements_trigger','billing_settlements_references','billing_settlements_update','billing_settlements_insert','billing_subscriptions_delete','billing_subscriptions_truncate','billing_subscriptions_trigger','billing_subscriptions_references','billing_subscriptions_update','invoice_id_update','invoice_organization_id_update','invoice_catalog_version_update','invoice_lines_update','invoice_total_ugx_update','invoice_currency_update','invoice_payment_key_update','invoice_created_at_update','invoice_currency_insert','invoice_state_insert','invoice_revision_insert','invoice_payment_key_insert','invoice_created_at_insert','billing_reconciliation_jobs_delete','billing_reconciliation_jobs_truncate','billing_reconciliation_jobs_trigger','billing_reconciliation_jobs_references','billing_reconciliation_jobs_insert','billing_reconciliation_history_delete','billing_reconciliation_history_truncate','billing_reconciliation_history_trigger','billing_reconciliation_history_references','billing_reconciliation_history_update','reconciliation_id_update','reconciliation_organization_id_update','reconciliation_invoice_id_update','reconciliation_provider_id_update','reconciliation_transaction_id_update','reconciliation_policy_update','reconciliation_lease_token_update','reconciliation_lease_until_update'];
 for(const key of additional){
  if(flags[key]!==false)throw Error('Runtime database privilege check failed: '+key);
 }
 console.log(JSON.stringify({schema:'ASSETTRUST_V60_RUNTIME_PRIVILEGE_AUDIT',ok:true,
  role:RUNTIME_ROLE,checks:result.checkedPrivileges+additional.length,readonly:true,productionApproved:false,
  disclaimer:'This CI login check does not prove tenant RLS on unprotected tables or production role permissions.'}));
}catch(e){console.error('FAIL v0.60 database privilege audit: '+e.message);process.exitCode=1;
}finally{await db.end();}
