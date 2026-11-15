'use strict';
/** Read-only operational policy inspection. No database connection or secrets loaded. */
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const EXPECTED={max:12,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000,lock_timeout:3000,idle_in_transaction_session_timeout:30000};
function inspect(root=ROOT){
 const src=fs.readFileSync(path.join(root,'apps/api/src/database.ts'),'utf8');
 const limits=fs.readFileSync(path.join(root,'apps/api/src/contexts/platform/domain/db-runtime-limits.ts'),'utf8');
 const checks={
  mandatoryPoolPolicy:src.includes('...ONLINE_DATABASE_LIMITS')&&src.includes("from './contexts/platform/domain/db-runtime-limits'"),
  rollbackFailureDiscardsConnection:src.includes('catch{discard=true;}')&&src.includes('client.release(discard)'),
  commitFailureDiscardsConnection:src.includes("catch(error){discard=true;throw error;}"),
  connectionTimeout:/connectionTimeoutMillis:\s*5_?000/.test(limits),
  statementTimeout:/statement_timeout:\s*15_?000/.test(limits),
  queryTimeout:/query_timeout:\s*20_?000/.test(limits),
  lockTimeout:/lock_timeout:\s*3_?000/.test(limits),
  idleTransactionTimeout:/idle_in_transaction_session_timeout:\s*30_?000/.test(limits)
 };
 return {schema:'ASSETTRUST_V72_DATABASE_DIAGNOSTICS',mode:'READ_ONLY',version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,
  checks,policyConfigured:Object.values(checks).every(Boolean),expected:EXPECTED,
  liveDatabaseTested:false,productionApproved:false,releaseStatus:'NO_GO'};
}
function plan(){return {schema:'ASSETTRUST_V72_DATABASE_RELIABILITY_PLAN',mode:'READ_ONLY',productionApproved:false,
  action:'Run v72 source regression, then existing v71 supervised test on isolated Kali; use actual PostgreSQL evidence to verify deadlines and transaction failure handling.',
  noSecretRead:true,noDatabaseContact:true,releaseStatus:'NO_GO'};}
function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--inspect','--plan'].includes(args[0])){console.error('BLOCKED: SELECT_PLAN_OR_INSPECT');process.exitCode=1;return;}
 try{const report=args[0]==='--plan'?plan():inspect();console.log(JSON.stringify(report,null,2));if(report.policyConfigured===false)process.exitCode=1;}
 catch{console.error('BLOCKED: SOURCE_POLICY_UNAVAILABLE');process.exitCode=1;}
}
if(require.main===module)main();
module.exports={EXPECTED,inspect,plan,main};
