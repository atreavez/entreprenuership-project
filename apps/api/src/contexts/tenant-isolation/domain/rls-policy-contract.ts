/** v0.63 fail-closed live PostgreSQL RLS policy contract.
 * Domain-level expected policy semantics, no DB/HTTP/framework dependencies.
 * Only app-managed tenant tables are in scope. Operator-only SQL migrations are separate.
 * The catalog assertion is a defense in depth, not a substitute for a restricted SQL role.
 */
export type PolicyCommand='ALL'|'SELECT'|'INSERT'|'UPDATE';
export type Scope='tenant'|'recipient';
export type ExpectedPolicy={table:string;name:string;cmd:PolicyCommand;read:Scope|null;write:Scope|null};
export const POLICY_CONTRACT:readonly ExpectedPolicy[]=Object.freeze([
 {table:'report_pdf_layout_proposals',name:'report_pdf_layout_proposals_tenant_v46',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'report_pdf_layout_revisions',name:'report_pdf_layout_revisions_tenant_v46',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'report_pdf_layout_active',name:'report_pdf_layout_active_tenant_v46',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'case_evidence',name:'case_evidence_tenant_v48',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'assets',name:'assets_tenant_v49',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'verification_cases',name:'verification_cases_tenant_v49',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'documents',name:'documents_tenant_v50',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'audit_events',name:'audit_events_tenant_select_v61',cmd:'SELECT',read:'tenant',write:null},
 {table:'audit_events',name:'audit_events_tenant_insert_v61',cmd:'INSERT',read:null,write:'tenant'},
 {table:'case_tasks',name:'case_tasks_tenant_v62',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'disputes',name:'disputes_tenant_v62',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'monitoring_reminders',name:'monitoring_reminders_tenant_v62',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'verification_quotes',name:'verification_quotes_tenant_v62',cmd:'ALL',read:'tenant',write:'tenant'},
 {table:'notifications',name:'notifications_recipient_select_v62',cmd:'SELECT',read:'recipient',write:null},
 {table:'notifications',name:'notifications_recipient_update_v62',cmd:'UPDATE',read:'recipient',write:'recipient'},
 {table:'notifications',name:'notifications_tenant_insert_v62',cmd:'INSERT',read:null,write:'tenant'}
]);
export const PROTECTED_TABLES=Object.freeze([...new Set(POLICY_CONTRACT.map(p=>p.table))]);
export interface CatalogPolicy {
 tablename:string;policyname:string;cmd:string;permissive:string;roles:string[]|string;
 qual:string|null;with_check:string|null;
}
/** PostgreSQL pg_get_expr adds presentation-only parentheses and ::text/::uuid
 * casts. Compare the complete expression after discarding only those tokens.
 * Any SQL operator/function change remains visible and causes rejection.
 */
export function canonicalPredicate(value:unknown):string|null{
 if(typeof value!=='string')return null;
 return value.toLowerCase()
  .replace(/::(?:pg_catalog\.)?(?:text|uuid|character varying|varchar)\b/g,'')
  .replace(/[\s()]/g,'');
}
const tenant="organization_id=nullifcurrent_setting'assettrust.tenant_id',true,''";
const recipient=tenant+"andrecipient_id=nullifcurrent_setting'assettrust.actor_id',true,''";
export function expectedPredicate(scope:Scope|null):string|null{
 return scope==='tenant'?tenant:scope==='recipient'?recipient:null;
}
function rolesOnlyPublic(roles:CatalogPolicy['roles']):boolean{
 return Array.isArray(roles)?roles.length===1&&roles[0]==='public':roles==='{public}';
}
/** Zero tolerance for missing, duplicate, extra or permissive-bypass policies. */
export function inspectPolicyInventory(rows:readonly CatalogPolicy[]):{ok:boolean;issues:string[];expected:number;actual:number}{
 const issues:string[]=[];
 const required=new Map(POLICY_CONTRACT.map(p=>[p.table+':'+p.name,p]));
 const seen=new Set<string>();
 for(const row of rows){
  const key=row.tablename+':'+row.policyname;
  const p=required.get(key);
  if(!p){issues.push('Unexpected policy on protected table: '+key);continue;}
  if(seen.has(key)){issues.push('Duplicate catalog policy: '+key);continue;}
  seen.add(key);
  if(row.cmd!==p.cmd||row.permissive!=='PERMISSIVE'||!rolesOnlyPublic(row.roles))
   issues.push('Unexpected command, role or policy mode: '+key);
  if(canonicalPredicate(row.qual)!==expectedPredicate(p.read)||canonicalPredicate(row.with_check)!==expectedPredicate(p.write))
   issues.push('Tenant/recipient predicate does not match reviewed policy: '+key);
 }
 for(const key of required.keys())if(!seen.has(key))issues.push('Required policy missing: '+key);
 return {ok:issues.length===0,issues,expected:required.size,actual:rows.length};
}
