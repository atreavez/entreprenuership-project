/** Disposable SQL acceptance. The operator seeds temporary rows inside one
 * transaction, switches to the real restricted role, then rolls everything back.
 * No real payments, external requests, or production database modifications.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE}=require('./runtime-role-policy-v57.cjs');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||process.env.ASSETTRUST_E2E_ALLOW_MUTATION!=='YES'||process.env.ASSETTRUST_V87_BILLING_PG_CONFIRM!=='YES'||process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES')throw Error('BLOCKED: supervised disposable billing test required');
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))throw Error('BLOCKED: unexpected database');
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000,lock_timeout:3000});
const runtime=new pg.Client({connectionString:process.env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000});
let checks=0,connected=false,runtimeConnected=false,started=false,failed=false;
const check=(v,m)=>{assert.ok(v,m);checks++;};
async function denied(sql,params,code='42501'){
 await db.query('SAVEPOINT forbidden');
 try{await assert.rejects(db.query(sql,params),e=>e?.code===code);checks++;}
 finally{await db.query('ROLLBACK TO SAVEPOINT forbidden');await db.query('RELEASE SAVEPOINT forbidden');}
}
const scope=org=>db.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);
try{
 await runtime.connect();runtimeConnected=true;
 const identity=(await runtime.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=current_user')).rows[0];
 check(identity?.name===RUNTIME_ROLE&&['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'].every(k=>identity[k]===false),'Restricted runtime login required');
 await db.connect();connected=true;
 const operator=(await db.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
 check(operator?.rolsuper===true,'Disposable role-switch fixture requires superuser');
 await db.query('BEGIN');started=true;
 await db.query("SELECT pg_advisory_xact_lock(hashtext('assettrust:billing:catalog'))");
 const a=randomUUID(),b=randomUUID(),author=randomUUID(),reviewer=randomUUID(),change=randomUUID(),i=randomUUID(),j=randomUUID(),paid=randomUUID();
 for(const org of [a,b])await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[org,'Synthetic billing fixture']);
 for(const user of [author,reviewer])await db.query("INSERT INTO users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,'Synthetic billing fixture',$3,'disabled-fixture','ORG_ADMIN')",[user,a,user+'@example.invalid']);
 const version=Number((await db.query('SELECT coalesce(max(version),0)+1 AS version FROM billing_catalog_versions')).rows[0].version);
 const prices=[{code:'ci',unitUgx:25000,periodDays:30}],lines=[{code:'ci',quantity:1,unitUgx:25000,totalUgx:25000}];
 await db.query("INSERT INTO admin_configuration_changes(id,scope,scope_id,setting_key,proposed_value,expected_version,status,submitted_by,reviewed_by,reviewed_at) VALUES($1,'platform','00000000-0000-0000-0000-000000000000','billing.price_catalog',$2::jsonb,$3,'APPROVED',$4,$5,now())",[change,JSON.stringify(JSON.stringify(prices)),version-1,author,reviewer]);
 await db.query('INSERT INTO billing_catalog_versions(version,prices,approved_change_id) VALUES($1,$2::jsonb,$3)',[version,JSON.stringify(prices),change]);
 await db.query("INSERT INTO billing_invoices(id,organization_id,catalog_version,lines,total_ugx,state,revision,payment_key) VALUES($1,$2,$3,$4::jsonb,25000,'PAID',2,$5)",[paid,b,version,JSON.stringify(lines),JSON.stringify(['ci-fixture',paid])]);
 await db.query("INSERT INTO billing_settlements(organization_id,invoice_id,provider_id,transaction_id,amount_ugx,currency) VALUES($1,$2,'ci-fixture',$3,25000,'UGX')",[b,paid,paid]);
 await db.query(`SET LOCAL ROLE ${RUNTIME_ROLE}`);
 check((await db.query('SELECT current_user AS role')).rows[0].role===RUNTIME_ROLE,'Actual restricted SQL role');
 const insert='INSERT INTO billing_invoices(id,organization_id,catalog_version,lines,total_ugx) VALUES($1,$2,$3,$4::jsonb,25000)';
 await scope(a);await db.query(insert,[i,a,version,JSON.stringify(lines)]);
 await scope(b);await db.query(insert,[j,b,version,JSON.stringify(lines)]);
 await scope(a);
 const visible=await db.query('SELECT id,state,revision,total_ugx FROM billing_invoices WHERE id=ANY($1::uuid[])',[[i,j,paid]]);
 check(visible.rowCount===1&&visible.rows[0].id===i&&visible.rows[0].state==='DRAFT'&&Number(visible.rows[0].total_ugx)===25000,'Own invoice only, correct defaults');
 await denied(insert,[randomUUID(),b,version,JSON.stringify(lines)]);
 const issue=await db.query("UPDATE billing_invoices SET state='ISSUED',revision=1 WHERE id=$1 AND organization_id=$2 AND revision=0 RETURNING id",[i,a]);
 check(issue.rowCount===1,'Authorized state transition');
 await db.query("INSERT INTO billing_journal(organization_id,invoice_id,revision,event,debit_account,credit_account,amount_ugx) VALUES($1,$2,1,'ISSUED','RECEIVABLE','DEFERRED_SERVICE_REVENUE',25000)",[a,i]);
 await denied('UPDATE billing_invoices SET total_ugx=1 WHERE id=$1',[i]);
 await denied('UPDATE billing_invoices SET organization_id=$2 WHERE id=$1',[i,b]);
 await denied("UPDATE billing_invoices SET state='PAID',revision=2,payment_key='fake-payment' WHERE id=$1",[i]);
 await denied("INSERT INTO billing_invoices(id,organization_id,catalog_version,lines,total_ugx,state,revision) VALUES($1,$2,$3,$4::jsonb,25000,'ISSUED',1)",[randomUUID(),a,version,JSON.stringify(lines)]);
 await denied("INSERT INTO billing_settlements(organization_id,invoice_id,provider_id,transaction_id,amount_ugx,currency) VALUES($1,$2,'ci-fixture','fake',25000,'UGX')",[a,i]);
 await denied('UPDATE billing_journal SET amount_ugx=1 WHERE invoice_id=$1',[i]);
 await denied('DELETE FROM billing_journal WHERE invoice_id=$1',[i]);
 await denied('TRUNCATE billing_journal',[]);
 await denied('UPDATE billing_catalog_versions SET prices=$2::jsonb WHERE version=$1',[version,'[]']);
 const cross=await db.query('SELECT invoice_id FROM billing_settlements WHERE invoice_id=$1',[paid]);
 check(cross.rowCount===0,'Cross-tenant settlement invisible');
 await scope('');
 check((await db.query('SELECT id FROM billing_invoices WHERE id=ANY($1::uuid[])',[[i,j,paid]])).rowCount===0,'No tenant scope yields no invoices');
 await scope(a);
 check((await db.query('SELECT amount_ugx FROM billing_journal WHERE invoice_id=$1',[i])).rows[0].amount_ugx==='25000','Journal unchanged');
}catch(e){failed=true;console.error('Billing acceptance failed: '+(e instanceof assert.AssertionError?e.message:'database or policy check failed'));}
finally{
 if(started)try{await db.query('ROLLBACK');}catch{failed=true;}
 if(connected)try{await db.end();}catch{failed=true;}
 if(runtimeConnected)try{await runtime.end();}catch{failed=true;}
}
if(failed)process.exitCode=1;
else console.log(JSON.stringify({schema:'ASSETTRUST_V87_BILLING_PG',status:'PASSED',checks,rolledBack:true,productionApproved:false,realPaymentsTested:false}));
