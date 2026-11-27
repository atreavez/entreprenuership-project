import type {PoolClient} from 'pg';
import {validateCatalog,type Catalog} from '../domain/commercial-policy';
export const BILLING_CATALOG_KEY='billing.price_catalog';
const PLATFORM_ID='00000000-0000-0000-0000-000000000000';
/** A publication hook for the existing dual-control admin approval transaction.
 * Not yet wired: the staged migration must be activated first. No public route.
 * Call after approval has been applied; the proposal, effective setting, catalog
 * snapshot and approval audit must all commit or roll back together.
 */
export async function publishApprovedCatalog(tx:PoolClient,changeId:string):Promise<Catalog>{
 await tx.query("SELECT pg_advisory_xact_lock(hashtext('assettrust:billing:catalog'))");
 const {rows}=await tx.query(`SELECT c.id,c.proposed_value,c.expected_version,v.version,v.value
  FROM public.admin_configuration_changes c JOIN public.admin_configuration_values v
   ON v.scope=c.scope AND v.scope_id=c.scope_id AND v.setting_key=c.setting_key
  WHERE c.id=$1 AND c.scope='platform' AND c.scope_id=$2 AND c.setting_key=$3
   AND c.status='APPROVED' AND c.reviewed_by IS NOT NULL AND c.reviewed_by<>c.submitted_by
   AND v.version=c.expected_version+1 AND v.value=c.proposed_value FOR SHARE OF c,v`,[changeId,PLATFORM_ID,BILLING_CATALOG_KEY]);
 if(rows.length!==1)throw Error('Independently approved current catalog required');
 const row=rows[0];
 if(typeof row.value!=='string'||row.value.length>24000)throw Error('Invalid catalog encoding');
 const prices=JSON.parse(row.value);
 const catalog=validateCatalog({version:Number(row.version),prices});
 const result=await tx.query('INSERT INTO public.billing_catalog_versions(version,prices,approved_change_id) VALUES($1,$2::jsonb,$3) ON CONFLICT (version) DO NOTHING RETURNING version',[catalog.version,JSON.stringify(catalog.prices),changeId]);
 if(result.rowCount!==1)throw Error('Catalog version already published');
 return catalog;
}
