'use strict';
/*
 * Transactional, serial, checksummed migrations. Uses `pg` only at runtime;
 * plan/security tests can run without dependencies.
 */
const {buildPlan,validateLedger} = require('./plan.cjs');
// Legacy recovery baseline is intentionally capped at v0.27. NEVER mark new migrations applied without running them.
const LEGACY_BASELINE_MIGRATION_COUNT = 8;
// Non-blocking session advisory lock prevents a stalled or concurrent migration
// process from hanging a deploy indefinitely. Its numeric ID is historical.
const MIGRATION_LOCK_ID = 1642872011;
const LEDGER = `CREATE TABLE IF NOT EXISTS assettrust_schema_migrations (
 filename text PRIMARY KEY, sha256 char(64) NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now()
)`;
const EXPECTED_LEGACY_TABLES = [
 'organizations','users','assets','verification_cases','case_evidence','documents','audit_events',
 'team_invitations','resource_grants','disputes','auth_sessions','auth_mfa_credentials',
 'professional_accreditations','parcel_boundary_claims'
];
// These are hard requirements for a safe baseline; baseline still requires manual review.
const EXPECTED_LEGACY_COLUMNS = [
 ['documents','storage_format'],['documents','encryption_key_id'],
 ['case_evidence','review_status'],['auth_sessions','refresh_hash'],
 ['parcel_boundary_claims','geometry'],['parcel_boundary_claims','status'],
 ['users','admin_mfa_required'],['team_invitations','revoked_at'],['team_invitations','accepted_by']
];
async function existingTables(client){
 const {rows}=await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'");
 return new Set(rows.map(r=>r.tablename));
}
async function verifyLegacySchema(client){
 const tables=await existingTables(client);
 const missing=EXPECTED_LEGACY_TABLES.filter(t=>!tables.has(t));
 if(missing.length)throw new Error('Cannot baseline incomplete legacy schema; missing tables: '+missing.join(', '));
 const ext=await client.query("SELECT 1 FROM pg_extension WHERE extname='postgis'");
 if(!ext.rowCount)throw new Error('Cannot baseline: PostGIS extension not installed');
 const {rows}=await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'");
 const actual=new Set(rows.map(r=>r.table_name+'.'+r.column_name));
 const colMissing=EXPECTED_LEGACY_COLUMNS.filter(([t,c])=>!actual.has(t+'.'+c));
 if(colMissing.length)throw new Error('Cannot baseline: missing columns '+colMissing.map(pair=>pair.join('.')).join(', '));
}
/** Re-throw the underlying SQL failure, but make a broken ROLLBACK visible.
 * An unknown transaction state is never accepted as a successful migration.
 */
async function rollbackAfterFailure(client, primary, label, began){
 if(!began)throw primary;
 try { await client.query('ROLLBACK'); }
 catch {
  throw new Error(label+' failed and ROLLBACK failed; migration state is uncertain. Check the ledger before retry.',{cause:primary});
 }
 throw primary;
}
async function run({connectionString=process.env.DATABASE_URL,baseline=false,check=false,quiet=false,clientFactory}={}){
 if(!connectionString && !clientFactory)throw new Error('DATABASE_URL is required');
 if(baseline&&check)throw new Error('Cannot baseline and check in the same operation');
 const plan=buildPlan();
 const client=clientFactory ? clientFactory() : new (require('pg').Client)({connectionString,connectionTimeoutMillis:8000,application_name:'assettrust-migrations-v78'});
 let locked=false, primaryError=null, connected=false;
 try{
  await client.connect();connected=true;
  const lock=await client.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[MIGRATION_LOCK_ID]);
  if(lock.rows?.length!==1||lock.rows[0].acquired!==true)
   throw new Error('Another migration/check owns the schema lock; stop and retry after it finishes (no changes made)');
  locked=true;
  const preExisting=await existingTables(client);
  const hadLedger=preExisting.has('assettrust_schema_migrations');
  if(!hadLedger && preExisting.has('organizations') && !baseline)throw new Error('Legacy database has no migration ledger. Back up the DB, then see docs/V11_MIGRATION_AND_RELEASE.md (explicit baseline required).');
  if(baseline){
   if(process.env.ASSETTRUST_BASELINE_LEGACY_SCHEMA!=='YES'||process.env.ASSETTRUST_BACKUP_CONFIRMED!=='YES')throw new Error('Baseline requires ASSETTRUST_BASELINE_LEGACY_SCHEMA=YES and ASSETTRUST_BACKUP_CONFIRMED=YES after a verified backup');
   if(hadLedger)throw new Error('A migration ledger already exists; baseline is not appropriate');
   await verifyLegacySchema(client);
   let began=false;
   try{
    await client.query('BEGIN');began=true;
    await client.query(LEDGER);
    for(const m of plan.slice(0,LEGACY_BASELINE_MIGRATION_COUNT))await client.query('INSERT INTO assettrust_schema_migrations(filename,sha256) VALUES($1,$2)',[m.filename,m.sha256]);
    await client.query('COMMIT');
   }catch(e){await rollbackAfterFailure(client,e,'Legacy baseline',began);}
   if(!quiet)console.log('BASELINED '+LEGACY_BASELINE_MIGRATION_COUNT+' verified legacy migrations; NEW migrations are still pending and must be applied with db:migrate.');
   return {baselined:LEGACY_BASELINE_MIGRATION_COUNT,applied:0,checked:0};
  }
  if(!hadLedger){
   if(check)throw new Error('Migration ledger is missing');
   await client.query(LEDGER);
  }
  const {rows}=await client.query('SELECT filename,sha256 FROM assettrust_schema_migrations ORDER BY filename');
  const pending=validateLedger(plan,rows);
  if(check){
   if(pending.length)throw new Error(pending.length+' pending migrations: '+pending.map(m=>m.filename).join(', '));
   if(!quiet)console.log('All '+plan.length+' migrations match their recorded SHA-256 fingerprints.');
   return {checked:plan.length,applied:0};
  }
  let applied=0;
  for(const m of pending){
   let began=false;
   try{
    await client.query('BEGIN');began=true;
    await client.query(m.sql);
    await client.query('INSERT INTO assettrust_schema_migrations(filename,sha256) VALUES($1,$2)',[m.filename,m.sha256]);
    await client.query('COMMIT');applied++;
   }catch(e){
    // COMMIT may have succeeded on the server despite a network error. The
    // correct recovery is to inspect the checksummed ledger, not mark success.
    let failure=e;
    try{await rollbackAfterFailure(client,e,'Migration '+m.filename,began);}
    catch(rollbackError){failure=rollbackError;}
    throw new Error('Migration '+m.filename+' failed; inspect the checksummed ledger before retry: '+failure.message,{cause:failure});
   }
   if(!quiet)console.log('Applied '+m.filename+' ('+m.sha256.slice(0,12)+')');
  }
  if(!quiet)console.log('Schema migration run complete; newly applied='+applied+', total='+plan.length);
  return {applied,checked:plan.length};
 }catch(error){primaryError=error;throw error;}
 finally{
  let cleanupError=null;
  if(locked){
   try{
    const unlocked=await client.query('SELECT pg_advisory_unlock($1::bigint) AS released',[MIGRATION_LOCK_ID]);
    if(unlocked.rows?.length!==1||unlocked.rows[0].released!==true)
     throw new Error('Migration lock was not released');
   }catch{cleanupError=new Error('Migration advisory unlock failed; connection must be closed');}
  }
  try{await client.end();}catch{if(connected)cleanupError??=new Error('Migration database connection did not close cleanly');}
  // Never hide the original SQL failure behind a secondary cleanup failure.
  if(cleanupError&&!primaryError)throw cleanupError;
 }
}
if(require.main===module){
 run({baseline:process.argv.includes('--baseline'),check:process.argv.includes('--check')}).catch(e=>{console.error('AssetTrust migration failed:',e.message);process.exitCode=1});
}
module.exports={run,verifyLegacySchema,EXPECTED_LEGACY_TABLES,EXPECTED_LEGACY_COLUMNS,LEGACY_BASELINE_MIGRATION_COUNT,MIGRATION_LOCK_ID,rollbackAfterFailure};
