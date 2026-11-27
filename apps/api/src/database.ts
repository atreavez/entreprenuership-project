import {setTenantScope,setRecipientScope} from './contexts/tenant-isolation/application/tenant-scope';
import {inspectPolicyInventory,PROTECTED_TABLES} from './contexts/tenant-isolation/domain/rls-policy-contract';
import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import {ONLINE_DATABASE_LIMITS} from './contexts/platform/domain/db-runtime-limits';
@Injectable()
export class Database implements OnModuleDestroy, OnModuleInit {
 private pool:Pool;
 constructor() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  this.pool = new Pool({connectionString:process.env.DATABASE_URL,...ONLINE_DATABASE_LIMITS});
 }
 async onModuleInit(){
  // Historical test compatibility: local ordinary dev can skip startup-only
  // validation. All readiness checks below ALWAYS verify the live catalog.
  if(process.env.NODE_ENV!=='production' && process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')return;
  await this.assertRuntimeIsolation();
 }
 /** Read-only runtime policy inspection for every /readyz request. Unlike the
  * startup gate, this cannot be skipped in development/test. It checks the
  * currently connected PostgreSQL role, RLS FORCE bits, table ownership and
  * every reviewed policy predicate. A catalog change after startup therefore
  * removes the process from service immediately on its next readiness probe.
  */
 async assertRuntimeIsolation():Promise<{policiesVerified:number;tablesVerified:number}>{
  const {rows:roles}=await this.pool.query(`SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,
    current_user<>session_user AS identity_mismatch,
    EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=pg_roles.oid) AS inherited_membership,
    has_schema_privilege(current_user,'public','CREATE') AS public_schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=ANY($1::text[])
      AND (c.relowner=pg_roles.oid OR has_table_privilege(current_user,c.oid,'TRUNCATE')
       OR has_table_privilege(current_user,c.oid,'TRIGGER')
       OR has_any_column_privilege(current_user,c.oid,'REFERENCES'))) AS protected_ddl,
    (has_any_column_privilege(current_user,'public.assettrust_schema_migrations','INSERT')
     OR has_any_column_privilege(current_user,'public.assettrust_schema_migrations','UPDATE')
     OR has_table_privilege(current_user,'public.assettrust_schema_migrations','DELETE')
     OR has_any_column_privilege(current_user,'public.audit_events','UPDATE')
     OR has_table_privilege(current_user,'public.audit_events','DELETE')
     OR has_any_column_privilege(current_user,'public.anchor_job_history','UPDATE')
     OR has_table_privilege(current_user,'public.anchor_job_history','DELETE')
     OR has_table_privilege(current_user,'public.anchor_jobs','DELETE')
     OR EXISTS(SELECT 1 FROM unnest(ARRAY['billing_catalog_versions','billing_journal','billing_settlements','billing_subscriptions']) AS t(name)
      WHERE has_any_column_privilege(current_user,'public.'||t.name,'UPDATE') OR has_table_privilege(current_user,'public.'||t.name,'DELETE'))
     OR has_table_privilege(current_user,'public.billing_invoices','DELETE')
     OR has_table_privilege(current_user,'public.billing_reconciliation_jobs','DELETE')
     OR has_any_column_privilege(current_user,'public.billing_reconciliation_jobs','INSERT')
     OR has_table_privilege(current_user,'public.billing_reconciliation_history','DELETE')
     OR has_any_column_privilege(current_user,'public.billing_reconciliation_history','UPDATE')
     OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','organization_id','invoice_id','provider_id','transaction_id','policy','lease_token','lease_until']) AS c(name)
       WHERE has_column_privilege(current_user,'public.billing_reconciliation_jobs',c.name,'UPDATE'))
     OR has_any_column_privilege(current_user,'public.billing_settlements','INSERT')
     OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','organization_id','catalog_version','lines','total_ugx','currency','payment_key','created_at']) AS c(name)
      WHERE has_column_privilege(current_user,'public.billing_invoices',c.name,'UPDATE'))
     OR EXISTS(SELECT 1 FROM unnest(ARRAY['currency','state','revision','payment_key','created_at']) AS c(name)
      WHERE has_column_privilege(current_user,'public.billing_invoices',c.name,'INSERT'))) AS immutable_write,
    (has_table_privilege(current_user,'public.assettrust_schema_migrations','SELECT')
     AND has_table_privilege(current_user,'public.audit_events','SELECT')
     AND has_table_privilege(current_user,'public.audit_events','INSERT')
     AND has_table_privilege(current_user,'public.anchor_job_history','SELECT')
     AND has_table_privilege(current_user,'public.anchor_job_history','INSERT')
     AND has_table_privilege(current_user,'public.anchor_jobs','SELECT')
     AND has_table_privilege(current_user,'public.anchor_jobs','INSERT')
     AND has_table_privilege(current_user,'public.anchor_jobs','UPDATE')
     AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['billing_catalog_versions','billing_invoices','billing_journal','billing_settlements','billing_subscriptions']) AS t(name)
       WHERE NOT has_table_privilege(current_user,'public.'||t.name,'SELECT'))
     AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['billing_catalog_versions','billing_journal','billing_subscriptions']) AS t(name)
       WHERE NOT has_table_privilege(current_user,'public.'||t.name,'INSERT'))
     AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['id','organization_id','catalog_version','lines','total_ugx']) AS c(name)
       WHERE NOT has_column_privilege(current_user,'public.billing_invoices',c.name,'INSERT'))
     AND has_column_privilege(current_user,'public.billing_invoices','state','UPDATE')
     AND has_column_privilege(current_user,'public.billing_invoices','revision','UPDATE')
     AND has_table_privilege(current_user,'public.billing_reconciliation_jobs','SELECT')
     AND has_table_privilege(current_user,'public.billing_reconciliation_history','SELECT')
     AND has_table_privilege(current_user,'public.billing_reconciliation_history','INSERT')
     AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['state','revision','attempts','next_run_at']) AS c(name)
      WHERE NOT has_column_privilege(current_user,'public.billing_reconciliation_jobs',c.name,'UPDATE'))) AS required_access
   FROM pg_roles WHERE rolname=current_user`,[[...PROTECTED_TABLES,'assettrust_schema_migrations','billing_catalog_versions']]);
  if(roles.length!==1||roles[0].rolsuper||roles[0].rolbypassrls||roles[0].rolcreaterole||roles[0].rolcreatedb)
   throw new Error('Unsafe PostgreSQL application role: elevated privileges are forbidden in production');
  const flags=roles[0];
  // Strict booleans: missing evidence must not be treated as a denied privilege.
  for(const key of ['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','identity_mismatch','inherited_membership','public_schema_create','database_create','protected_ddl','immutable_write']){
   if(flags[key]!==false)throw new Error('Unsafe PostgreSQL runtime privilege contract');
  }
  if(flags.required_access!==true)throw new Error('Required PostgreSQL runtime access is missing');
  const {rows:tables}=await this.pool.query(`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS table_owner
   FROM pg_class WHERE oid=ANY(ARRAY[
    'public.report_pdf_layout_proposals'::regclass,
    'public.report_pdf_layout_revisions'::regclass,
    'public.report_pdf_layout_active'::regclass,
    'public.case_evidence'::regclass,
    'public.assets'::regclass,
    'public.verification_cases'::regclass,
    'public.documents'::regclass,
    'public.audit_events'::regclass,
    'public.case_tasks'::regclass,
    'public.disputes'::regclass,
    'public.monitoring_reminders'::regclass,
    'public.verification_quotes'::regclass,
    'public.notifications'::regclass,
    'public.anchor_jobs'::regclass,
    'public.anchor_job_history'::regclass,
    'public.billing_invoices'::regclass,
    'public.billing_journal'::regclass,
    'public.billing_settlements'::regclass,
    'public.billing_subscriptions'::regclass,
    'public.billing_reconciliation_jobs'::regclass,
    'public.billing_reconciliation_history'::regclass
   ])`);
  if(tables.length!==21||tables.some((r:any)=>!r.relrowsecurity||!r.relforcerowsecurity))
   throw new Error('Required private table tenant row-level security is missing; do not start production API');
  const currentRole=(await this.pool.query('SELECT current_user AS runtime_role')).rows[0]?.runtime_role;
  if(!currentRole||tables.some((r:any)=>r.table_owner===currentRole))
   throw new Error('Production runtime database role must not own tenant-isolated tables');
  // A table may have FORCE RLS yet be exposed by an extra permissive OR policy.
  // Require the exact reviewed policy set and predicates, fail-closed at startup.
  const {rows:policies}=await this.pool.query(`SELECT tablename,policyname,cmd,permissive,roles,qual,with_check
    FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])`,[PROTECTED_TABLES]);
  const catalog=inspectPolicyInventory(policies);
  if(!catalog.ok)throw new Error('Required PostgreSQL tenant/recipient policy contract is missing or changed; refuse API startup');
  return {policiesVerified:catalog.actual,tablesVerified:tables.length};
 }
 query<T extends QueryResultRow=any>(sql:string,params:any[]=[]){return this.pool.query<T>(sql,params);}
 /** All protected tenant table reads use a transaction-local PostgreSQL scope.
  * Never issue set_config(..., true) through pool.query: it would be reset before the read.
  */
 async tenantQuery<T extends QueryResultRow=any>(organizationId:string,sql:string,params:any[]=[]){
  return this.transaction(async tx=>{
   await setTenantScope(tx,organizationId);
   return tx.query<T>(sql,params);
  });
 }

 /** Inbox queries require the authenticated recipient as well as organization context. */
 async tenantRecipientQuery<T extends QueryResultRow=any>(organizationId:string,actorId:string,sql:string,params:any[]=[]){
  return this.transaction(async tx=>{
   await setRecipientScope(tx,organizationId,actorId);
   return tx.query<T>(sql,params);
  });
 }

 /** Any failed BEGIN, COMMIT or ROLLBACK makes the pooled connection unsafe.
  * Destroy it instead of returning an unknown transaction state to another user.
  * Preserve the original operation error even if rollback itself fails.
  */
 async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();
  let began=false, committed=false, discard=false;
  try{
   await client.query('BEGIN');began=true;
   const result=await fn(client);
   try{await client.query('COMMIT');committed=true;}
   catch(error){discard=true;throw error;}
   return result;
  }catch(error){
   if(began&&!committed){
    try{await client.query('ROLLBACK');}catch{discard=true;}
   }else if(!began)discard=true;
   throw error;
  }finally{client.release(discard);}
 }
 async onModuleDestroy(){await this.pool.end();}
}
@Global()
@Module({providers:[Database],exports:[Database]})export class DatabaseModule{}
