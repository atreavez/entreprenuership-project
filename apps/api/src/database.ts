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
  const {rows:roles}=await this.pool.query(`SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb
   FROM pg_roles WHERE rolname=current_user`);
  if(roles.length!==1||roles[0].rolsuper||roles[0].rolbypassrls||roles[0].rolcreaterole||roles[0].rolcreatedb)
   throw new Error('Unsafe PostgreSQL application role: elevated privileges are forbidden in production');
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
    'public.notifications'::regclass
   ])`);
  if(tables.length!==13||tables.some((r:any)=>!r.relrowsecurity||!r.relforcerowsecurity))
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
