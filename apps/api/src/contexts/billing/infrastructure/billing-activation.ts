import {ServiceUnavailableException} from '@nestjs/common';
import {REQUIRED_SCHEMA_MIGRATIONS} from '../../platform/domain/schema-manifest';
import {PROTECTED_TABLES} from '../../tenant-isolation/domain/rls-policy-contract';
type Queryable={query(sql:string,params?:unknown[]):Promise<{rows:any[]}>};
const required=['billing_invoices','billing_journal','billing_settlements','billing_subscriptions'];
/** Source review and actual applied checksum are BOTH necessary. A manually
 * created table or an environment toggle cannot activate commercial operations.
 * Runtime role/privilege verification remains mandatory on migration promotion.
 */
export async function requireBillingActivation(tx:Queryable):Promise<void>{
 const migration=REQUIRED_SCHEMA_MIGRATIONS.find(m=>String(m.filename)==='030_commercial_billing.sql');
 if(!migration||!required.every(t=>PROTECTED_TABLES.includes(t)))
  throw new ServiceUnavailableException('Commercial billing schema has not been released');
 const {rows}=await tx.query('SELECT sha256 FROM public.assettrust_schema_migrations WHERE filename=$1',[migration.filename]);
 if(rows.length!==1||rows[0].sha256!==migration.sha256)
  throw new ServiceUnavailableException('Commercial billing migration has not been verified');
}
