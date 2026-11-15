'use strict';
/** v0.57: dependency-free CI runtime/database-role boundary.
 * Operator credentials are for migrations and privileged integration fixtures only.
 * Real HTTP API processes must use an independent NO-BYPASSRLS login role.
 * Never include URL contents in errors or logs.
 */
const REQUIRED_RLS_TABLES=Object.freeze(['report_pdf_layout_proposals','report_pdf_layout_revisions','report_pdf_layout_active','case_evidence','assets','verification_cases','documents','audit_events','case_tasks','disputes','monitoring_reminders','verification_quotes','notifications']);
const RUNTIME_ROLE='assettrust_v57_ci_runtime';
function parseSafeUrl(value){
 if(typeof value!=='string'||!value)throw Error('A PostgreSQL connection URL is required');
 let url;try{url=new URL(value)}catch{throw Error('Invalid PostgreSQL connection URL')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||
    !url.pathname||url.pathname==='/'||url.search||url.hash)throw Error('Invalid or credential-free PostgreSQL URL');
 return url;
}
function validateRuntimeDatabaseUrls(operatorUrl,runtimeUrl){
 const operator=parseSafeUrl(operatorUrl),runtime=parseSafeUrl(runtimeUrl);
 if(!['127.0.0.1','localhost','[::1]'].includes(operator.hostname)||
    !['assettrust_ci','assettrust_test'].includes(decodeURIComponent(operator.pathname.slice(1))))
  throw Error('CI database must be loopback and disposable');
 const normalized=x=>[x.hostname==='localhost'?'127.0.0.1':x.hostname,x.port||'5432',decodeURIComponent(x.pathname.slice(1))];
 const a=normalized(operator),b=normalized(runtime);
 if(a.some((x,i)=>x!==b[i]))throw Error('Operator and API runtime databases must be the same disposable host, port and database');
 if(operator.username===runtime.username)throw Error('API runtime cannot use the database operator login');
 if(decodeURIComponent(runtime.username)!==RUNTIME_ROLE)throw Error('Unexpected API runtime database role');
 return {host:a[0],port:Number(a[1]),database:a[2],operatorUser:decodeURIComponent(operator.username),runtimeUser:decodeURIComponent(runtime.username)};
}
function runtimeDatabaseUrl(env){
 if(env.CI==='true'&&env.NODE_ENV==='test'&&env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')
  throw Error('Supervised CI HTTP tests cannot use a database operator login');
 if(env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')return env.DATABASE_URL;
 if(env.NODE_ENV!=='test'||env.CI!=='true')throw Error('Guarded runtime role only supported for supervised CI test mode');
 validateRuntimeDatabaseUrls(env.DATABASE_URL,env.ASSETTRUST_RUNTIME_DATABASE_URL);
 return env.ASSETTRUST_RUNTIME_DATABASE_URL;
}
function evaluateDatabaseRole(rows, role,requiredTables=REQUIRED_RLS_TABLES){
 const issues=[];
 const flag=rows?.role;
 if(!flag||flag.rolsuper||flag.rolbypassrls||flag.rolcreatedb||flag.rolcreaterole)
  issues.push('API runtime role has elevated PostgreSQL privileges or could not be inspected');
 if(!role||role!==RUNTIME_ROLE)issues.push('Unexpected API runtime role');
 const tableRows=rows?.tables||[];
 for(const table of requiredTables){
  const match=tableRows.find(r=>r.relname===table);
  if(!match||!match.relrowsecurity||!match.relforcerowsecurity||match.table_owner===role)
   issues.push('Required RLS or nonowner check failed: '+table);
 }
 return {ok:issues.length===0,issues,checkedTables:requiredTables.length};
}
module.exports={RUNTIME_ROLE,REQUIRED_RLS_TABLES,parseSafeUrl,validateRuntimeDatabaseUrls,runtimeDatabaseUrl,evaluateDatabaseRole};
