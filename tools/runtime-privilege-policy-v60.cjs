'use strict';
/**
 * AssetTrust v0.60. Fail-closed, read-only checks for internal PostgreSQL table
 * privileges exercised by the HTTP runtime. This is NOT tenant RLS coverage
 * for the remaining application tables.
 */
const EXPECTED={
 migration_read:true, migration_insert:false, migration_update:false, migration_delete:false,
 audit_read:true, audit_insert:true, audit_update:false, audit_delete:false,
 public_schema_create:false, database_create:false, inherited_membership:false,
};
function evaluateRuntimePrivileges(row){
 const issues=[];
 for(const [key,expected] of Object.entries(EXPECTED)){
  if(!row || typeof row[key]!=='boolean' || row[key]!==expected)
   issues.push('Runtime database privilege check failed: '+key);
 }
 if(!row || row.rolsuper!==false || row.rolbypassrls!==false ||
    row.rolcreaterole!==false || row.rolcreatedb!==false)
   issues.push('Runtime database role is privileged or role flags are missing');
 return {ok:issues.length===0,issues,checkedPrivileges:Object.keys(EXPECTED).length};
}
module.exports={EXPECTED,evaluateRuntimePrivileges};
