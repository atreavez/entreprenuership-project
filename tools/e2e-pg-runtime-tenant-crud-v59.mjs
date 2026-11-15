/**
 * v0.59 full-CRUD seeded tenant-isolation contract. Uses two genuinely independent PostgreSQL logins:
 * (1) CI operator creates/removes synthetic fixture rows; (2) restricted runtime login
 * exercises SELECT, UPDATE, DELETE, INSERT with tenant-local PostgreSQL settings.
 * Explicitly limited to the already migrated disposable loopback CI/test database.
 * Synthetic rows are committed so the independent runtime login can see them.
 * Cleanup runs on both success and failure, but interruption can leave rows in a
 * disposable database. NEVER run against a production/shared database.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const {validateRuntimeDatabaseUrls,RUNTIME_ROLE,REQUIRED_RLS_TABLES,evaluateDatabaseRole}=require('./runtime-role-policy-v57.cjs');

// Every precondition is verified BEFORE importing pg or opening a socket.
if(process.env.ASSETTRUST_V59_CRUD_CONFIRM!=='YES'||process.env.CI!=='true'||process.env.NODE_ENV!=='test'||
   process.env.ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE!=='YES'||
   process.env.ASSETTRUST_V58_SEEDED_RLS_CONFIRM!=='YES'){
 throw Error('BLOCKED: supervised CI test mode and v0.58 seeded-data confirmation required');
}
const target=validateDisposablePgTarget(process.env);
if(!['assettrust_ci','assettrust_test'].includes(target.databaseName))
 throw Error('BLOCKED: v0.59 accepts only the dedicated assettrust_ci or assettrust_test database');
validateRuntimeDatabaseUrls(process.env.DATABASE_URL,process.env.ASSETTRUST_RUNTIME_DATABASE_URL);
const {default:pg}=await import('pg');
const operator=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v58-fixture-operator'});
const runtime=new pg.Client({connectionString:process.env.ASSETTRUST_RUNTIME_DATABASE_URL,connectionTimeoutMillis:5000,application_name:'assettrust-v58-restricted-runtime'});
const fixture=Array.from({length:2},()=>({org:randomUUID(),user:randomUUID(),asset:randomUUID(),case:randomUUID(),evidence:randomUUID(),document:randomUUID()}));
const tableIds={assets:'asset',verification_cases:'case',case_evidence:'evidence',documents:'document'};
const committed=[];const transient=[];
let opConnected=false,rtConnected=false,assertions=0;
const check=(condition,message)=>{assert.ok(condition,message);assertions++};
const assertCount=async(table,expected,label)=>{
 const result=await runtime.query(`SELECT count(*)::int AS n FROM public.${table} WHERE id=ANY($1::uuid[])`,[fixture.map(f=>f[tableIds[table]])]);
 assert.equal(result.rows[0].n,expected,`${label}: ${table}`);assertions++;
};
const setTenant=async(org)=>{await runtime.query("SELECT set_config('assettrust.tenant_id',$1,true)",[org]);};
async function addFixture(f,index){
 await operator.query('BEGIN');
 try{
  await operator.query('INSERT INTO public.organizations(id,name) VALUES($1,$2)',[f.org,`Synthetic v58 CI org ${index}`]);
  await operator.query('INSERT INTO public.users(id,organization_id,full_name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,$6)',
   [f.user,f.org,'Synthetic RLS tester',`v58-${f.user}@example.invalid`,'not-a-real-password','ORG_ADMIN']);
  await operator.query("SELECT set_config('assettrust.tenant_id',$1,true)",[f.org]);
  await operator.query(`INSERT INTO public.assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
   VALUES($1,$2,$3,'LAND','disposable','synthetic',$4)`,[f.asset,f.org,`AT58-${f.asset}`,f.user]);
  await operator.query('INSERT INTO public.verification_cases(id,organization_id,case_code,asset_id,created_by) VALUES($1,$2,$3,$4,$5)',
   [f.case,f.org,`AT58-${f.case}`,f.asset,f.user]);
  await operator.query(`INSERT INTO public.case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,observations,recorded_by)
   VALUES($1,$2,$3,'INTAKE','OTHER','synthetic CI','synthetic only',$4)`,[f.evidence,f.org,f.case,f.user]);
  await operator.query(`INSERT INTO public.documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format,encryption_key_id)
   VALUES($1,$2,$3,$4,'Synthetic metadata',$5,'application/pdf',0,$6,$7,'AES_256_GCM_V1','ci-test-only')`,
   [f.document,f.org,f.asset,f.case,`v58-${f.document}.bin`,'0'.repeat(64),f.user]);
  await operator.query('COMMIT');committed.push(f);
 }catch(e){await operator.query('ROLLBACK').catch(()=>{});throw e;}
}
/** Positive CRUD assertions prove the RLS runtime is not accidentally read-only.
 * All records are created in the restricted role's active tenant transaction and
 * rolled back before moving to the next tenant. The fixture owner records remain.
 */
async function assertAuthorizedCrud(f){
 const row={asset:randomUUID(),case:randomUUID(),evidence:randomUUID(),document:randomUUID()};
 transient.push(row);
 const asset=await runtime.query(`INSERT INTO public.assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
 VALUES($1,$2,$3,'LAND','disposable','synthetic',$4) RETURNING id`,[row.asset,f.org,`AT59-${row.asset}`,f.user]);
 check(asset.rowCount===1,'Own-tenant asset INSERT must succeed');
 const investigation=await runtime.query(`INSERT INTO public.verification_cases(id,organization_id,case_code,asset_id,created_by)
 VALUES($1,$2,$3,$4,$5) RETURNING id`,[row.case,f.org,`AT59-${row.case}`,row.asset,f.user]);
 check(investigation.rowCount===1,'Own-tenant case INSERT must succeed');
 const evidence=await runtime.query(`INSERT INTO public.case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,observations,recorded_by)
 VALUES($1,$2,$3,'INTAKE','OTHER','synthetic','authorized',$4) RETURNING id`,[row.evidence,f.org,row.case,f.user]);
 check(evidence.rowCount===1,'Own-tenant evidence INSERT must succeed');
 const document=await runtime.query(`INSERT INTO public.documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format,encryption_key_id)
 VALUES($1,$2,$3,$4,'Synthetic authorized metadata',$5,'application/pdf',0,$6,$7,'AES_256_GCM_V1','ci-test-only') RETURNING id`,
 [row.document,f.org,row.asset,row.case,`v59-${row.document}.bin`,'0'.repeat(64),f.user]);
 check(document.rowCount===1,'Own-tenant document INSERT must succeed');
 for(const [table,key,field] of [['assets','asset','description'],['verification_cases','case','notes'],
 ['case_evidence','evidence','observations'],['documents','document','display_name']]){
  const updated=await runtime.query(`UPDATE public.${table} SET ${field}=$2 WHERE id=$1 RETURNING id`,[row[key],'authorized v59 update']);
  check(updated.rowCount===1,`Own-tenant UPDATE must succeed: ${table}`);
  const counted=await runtime.query(`SELECT count(*)::int AS n FROM public.${table} WHERE id=$1`,[row[key]]);
  check(counted.rows[0].n===1,`Own-tenant INSERT must be visible: ${table}`);
 }
 // Delete in foreign-key-safe child-to-parent order; prove authorized DELETE
 // can actually remove records, not merely return success for missing rows.
 for(const [table,key] of [['documents','document'],['case_evidence','evidence'],
 ['verification_cases','case'],['assets','asset']]){
  const deleted=await runtime.query(`DELETE FROM public.${table} WHERE id=$1 RETURNING id`,[row[key]]);
  check(deleted.rowCount===1,`Own-tenant DELETE must succeed: ${table}`);
 }
}
async function cleanupFixture(f){
 // The disposable operator can delete scoped fixture rows even when FORCE RLS is enabled.
 await operator.query('BEGIN');
 try{
  await operator.query("SELECT set_config('assettrust.tenant_id',$1,true)",[f.org]);
  for(const [table,column] of [['documents','document'],['case_evidence','evidence'],['verification_cases','case'],['assets','asset']])
   await operator.query(`DELETE FROM public.${table} WHERE id=$1 AND organization_id=$2`,[f[column],f.org]);
  await operator.query('DELETE FROM public.users WHERE id=$1 AND organization_id=$2',[f.user,f.org]);
  await operator.query('DELETE FROM public.organizations WHERE id=$1',[f.org]);
  await operator.query('COMMIT');
 }catch(e){await operator.query('ROLLBACK').catch(()=>{});throw e;}
}
async function assertRejectedWrite(sql,params,label){
 await runtime.query('SAVEPOINT v58_forbidden');
 try{
  await assert.rejects(()=>runtime.query(sql,params),err=>err?.code==='42501',`${label}: tenant RLS must reject insert`);assertions++;
 }finally{await runtime.query('ROLLBACK TO SAVEPOINT v58_forbidden');await runtime.query('RELEASE SAVEPOINT v58_forbidden');}
}
try{
 await operator.connect();opConnected=true;
 await runtime.connect();rtConnected=true;
 const identity=(await runtime.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
 const tables=(await runtime.query(`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS table_owner
  FROM pg_class WHERE oid=ANY($1::regclass[])`,[REQUIRED_RLS_TABLES.map(name=>'public.'+name)])).rows;
 const roleVerdict=evaluateDatabaseRole({role:identity,tables},identity?.name);
 check(identity?.name===RUNTIME_ROLE&&roleVerdict.ok&&tables.length===REQUIRED_RLS_TABLES.length,
  'RLS contract and restricted non-owner DB role must pass before any seed mutation');
 const ledger=(await operator.query(`SELECT filename FROM assettrust_schema_migrations
  WHERE filename IN ('021_pdf_layout_rls.sql','022_core_tenant_relationship_integrity.sql',
  '023_case_evidence_rls.sql','024_assets_and_cases_rls.sql','025_documents_rls.sql')`)).rows;
 check(ledger.length===5,'All core RLS and integrity migrations must be installed');
 await addFixture(fixture[0],0);await addFixture(fixture[1],1);
 const protectedTables=Object.keys(tableIds);
 // No scope is present in this independent runtime connection.
 for(const table of protectedTables)await assertCount(table,0,'no tenant scope');
 for(let i=0;i<2;i++){
  const own=fixture[i],other=fixture[1-i];
  await runtime.query('BEGIN');
  try{
   await setTenant(own.org);
   for(const table of protectedTables)await assertCount(table,1,'own-tenant SELECT');
   await assertAuthorizedCrud(own);
   for(const [table,column] of Object.entries(tableIds)){
    const r=await runtime.query(`UPDATE public.${table} SET organization_id=organization_id WHERE id=$1 RETURNING id`,[other[column]]);
    check(r.rowCount===0,`Cross-tenant UPDATE must be invisible: ${table}`);
    const d=await runtime.query(`DELETE FROM public.${table} WHERE id=$1 RETURNING id`,[other[column]]);
    check(d.rowCount===0,`Cross-tenant DELETE must be invisible: ${table}`);
   }
   await assertRejectedWrite(`INSERT INTO public.assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
    VALUES($1,$2,$3,'LAND','disposable','synthetic',$4)`,[randomUUID(),other.org,`AT58-${randomUUID()}`,other.user],'assets');
   await assertRejectedWrite(`INSERT INTO public.verification_cases(id,organization_id,case_code,asset_id,created_by)
    VALUES($1,$2,$3,$4,$5)`,[randomUUID(),other.org,`AT58-${randomUUID()}`,other.asset,other.user],'verification_cases');
   await assertRejectedWrite(`INSERT INTO public.case_evidence(id,organization_id,case_id,stage,evidence_type,source_name,observations,recorded_by)
    VALUES($1,$2,$3,'INTAKE','OTHER','synthetic','synthetic',$4)`,[randomUUID(),other.org,other.case,other.user],'case_evidence');
   await assertRejectedWrite(`INSERT INTO public.documents(id,organization_id,asset_id,case_id,display_name,stored_name,mime_type,file_size,sha256,uploaded_by,storage_format,encryption_key_id)
    VALUES($1,$2,$3,$4,'Synthetic metadata',$5,'application/pdf',0,$6,$7,'AES_256_GCM_V1','ci-test-only')`,
    [randomUUID(),other.org,other.asset,other.case,`v58-${randomUUID()}.bin`,'0'.repeat(64),other.user],'documents');
  }finally{await runtime.query('ROLLBACK');}
  for(const table of protectedTables)await assertCount(table,0,'scope must not leak after transaction');
  await runtime.query('BEGIN');
  try{await setTenant(own.org);for(const table of protectedTables)await assertCount(table,1,'scope active before COMMIT');
   await runtime.query('COMMIT');
  }catch(e){await runtime.query('ROLLBACK').catch(()=>{});throw e;}
  for(const table of protectedTables)await assertCount(table,0,'scope must not leak after COMMIT');
 }
 console.log(JSON.stringify({schema:'ASSETTRUST_V59_SEEDED_RUNTIME_CRUD_RLS',ok:true,productionApproved:false,
  restrictedRole:RUNTIME_ROLE,organizations:2,seededTables:protectedTables,assertions,realSeparateConnections:true,authorizedCrudTested:true,
  coverage:'RLS enforced on assets/cases/evidence/document records; 3 PDF-layout tables audited by existing v0.46 contract; other tables not covered.'}));
}catch(e){console.error('FAIL v0.58 seeded RLS isolation: '+e.message);process.exitCode=1;
}finally{
 if(rtConnected){await runtime.query('ROLLBACK').catch(()=>{});await runtime.end().catch(()=>{});}
 if(opConnected){
  for(const [table,key] of [['documents','document'],['case_evidence','evidence'],['verification_cases','case'],['assets','asset']]){
   try{
    const ids=transient.map(t=>t[key]);
    if(ids.length){
     const r=await operator.query(`SELECT count(*)::int AS n FROM public.${table} WHERE id=ANY($1::uuid[])`,[ids]);
     if(r.rows[0].n!==0)throw Error('Transient test writes were not rolled back: '+table);
    }
   }catch(e){console.error('Disposable transient-row audit FAILED: '+e.message);process.exitCode=1;}
  }
  for(const f of committed.reverse()){
   try{await cleanupFixture(f)}catch(e){console.error('Disposable fixture cleanup FAILED: '+e.message);process.exitCode=1;}
  }
  await operator.end().catch(()=>{});
 }
}
