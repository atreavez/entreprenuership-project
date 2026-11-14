/** Live database test for transactional asset/case permission checks.
 * Only runs against a explicitly authorized, disposable loopback database;
 * all test rows are rolled back. Requires compiled NestJS API and pg.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {validateDisposablePgTarget}=require('./pg-e2e-policy-v21.cjs');
const target=validateDisposablePgTarget(process.env);
const {default:pg}=await import('pg');
const {Client}=pg;
const dir=dirname(fileURLToPath(import.meta.url));
const {requireCurrentAssetContribution,requireCurrentCaseContribution}=require(resolve(dir,'../apps/api/dist/contexts/access/infrastructure/transactional-access.js'));
const id={org:randomUUID(),owner:randomUUID(),guest:randomUUID(),asset:randomUUID(),case:randomUUID(),grant:randomUUID()};
const actor={id:id.guest,organizationId:id.org};
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
const fail=async promise=>assert.rejects(promise,err=>['ForbiddenException','NotFoundException'].includes(err?.name));
let transactionStarted=false;let count=0;
try{
 await client.connect();await client.query('BEGIN');transactionStarted=true;
 await client.query("SET LOCAL statement_timeout='10s'");
 await client.query("SET LOCAL lock_timeout='3s'");
 await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[id.org,'V23 disposable authorization fixture']);
 for(const [user,name,role] of [[id.owner,'Owner','ORG_ADMIN'],[id.guest,'Guest','CLIENT']]){
  await client.query(`INSERT INTO users(id,organization_id,full_name,email,password_hash,role)
   VALUES($1,$2,$3,$4,'test-hash-not-a-credential',$5)`,[user,id.org,name,`v23-${user}@invalid.example`,role]);
 }
 await client.query(`INSERT INTO assets(id,organization_id,asset_code,asset_type,district,declared_owner,created_by)
  VALUES($1,$2,$3,'LAND','Kampala','Unverified claim',$4)`,[id.asset,id.org,`V23-${id.asset}`,id.owner]);
 await fail(requireCurrentAssetContribution(client,actor,id.asset));count++;
 await client.query(`INSERT INTO resource_grants(id,organization_id,asset_id,grantee_id,permission,expires_at,created_by)
  VALUES($1,$2,$3,$4,'READ',now()+interval '2 hours',$5)`,[id.grant,id.org,id.asset,id.guest,id.owner]);
 await fail(requireCurrentAssetContribution(client,actor,id.asset));count++;
 await client.query("UPDATE resource_grants SET permission='CONTRIBUTE' WHERE id=$1",[id.grant]);
 assert.equal((await requireCurrentAssetContribution(client,actor,id.asset)).assetType,'LAND');count++;
 await client.query("UPDATE resource_grants SET expires_at=now()-interval '1 hour' WHERE id=$1",[id.grant]);
 await fail(requireCurrentAssetContribution(client,actor,id.asset));count++;
 await client.query(`INSERT INTO verification_cases(id,organization_id,case_code,asset_id,created_by,assigned_to)
  VALUES($1,$2,$3,$4,$5,$6)`,[id.case,id.org,`V23-${id.case}`,id.asset,id.owner,id.guest]);
 assert.equal((await requireCurrentCaseContribution(client,actor,id.case)).assetId,id.asset);count++;
 assert.equal((await requireCurrentAssetContribution(client,actor,id.asset)).assetType,'LAND');count++;
 await client.query('UPDATE verification_cases SET assigned_to=NULL WHERE id=$1',[id.case]);
 await fail(requireCurrentCaseContribution(client,actor,id.case));count++;
 await fail(requireCurrentAssetContribution(client,actor,id.asset));count++;
 assert.equal((await requireCurrentAssetContribution(client,{id:id.owner,organizationId:id.org},id.asset,{lockAssetForReview:true})).assetType,'LAND');count++;
 console.log(`PASS ${count} live Postgres authorization assertions on ${target.databaseName}; fixture will be rolled back`);
}finally{
 if(transactionStarted)try{await client.query('ROLLBACK')}catch(err){process.exitCode=1;console.error('FAILED to roll back fixtures:',err.message)}
 await client.end().catch(()=>{});
}
