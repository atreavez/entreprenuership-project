import {REQUIRED_SCHEMA_MIGRATIONS} from '../../platform/domain/schema-manifest';
import {PROTECTED_TABLES} from '../../tenant-isolation/domain/rls-policy-contract';
import {ServiceUnavailableException} from '@nestjs/common';
type Queryable={query(sql:string,params?:unknown[]):Promise<{rows:any[]}>};
const TABLES=['billing_refund_requests','billing_refund_decisions','billing_refund_approvals','billing_adjustments'];
/** False only for a deliberately staged release. Partial manifest or ledger
 * mismatch is an error, never a reason to ignore recorded reversals. */
export async function adjustmentSchemaReleased(tx:Queryable):Promise<boolean>{
 const m=REQUIRED_SCHEMA_MIGRATIONS.find(m=>String(m.filename)==='032_financial_adjustments.sql');
 const registered=TABLES.filter(t=>PROTECTED_TABLES.includes(t));
 if(!m&&registered.length===0)return false;
 if(!m||registered.length!==TABLES.length)throw new ServiceUnavailableException('Financial adjustment contract incomplete');
 const {rows}=await tx.query('SELECT sha256 FROM public.assettrust_schema_migrations WHERE filename=$1',[m.filename]);
 if(rows.length!==1||rows[0].sha256!==m.sha256)throw new ServiceUnavailableException('Financial adjustment migration unverified');
 return true;
}
export async function requireAdjustmentSchema(tx:Queryable):Promise<void>{
 if(!await adjustmentSchemaReleased(tx))throw new ServiceUnavailableException('Financial adjustments are not released');
}
export const adjustmentOrganizationLock=(org:string)=>JSON.stringify(['assettrust:billing:adjustment-org',org]);
export const adjustmentInvoiceLock=(org:string,invoice:string)=>JSON.stringify(['assettrust:billing:adjustment',org,invoice]);
