import { ForbiddenException, NotFoundException } from '@nestjs/common';

/** Infrastructure-only permission adapter for mutations.
 * A request-time guard remains useful for early rejection, but is NOT an
 * authorization boundary for delayed DB writes. Call this using the SAME
 * PostgreSQL transaction that performs the protected mutation.
 */
type Queryable = { query(sql:string,params?:any[]):Promise<{rows:any[]}> };
type Actor = {id:string;organizationId:string};

export async function requireCurrentAssetContribution(
 tx:Queryable, actor:Actor, assetId:string, options:{lockAssetForReview?:boolean;allowedActorRoles?:readonly string[]}={}
):Promise<{assetType:string}> {
 // Locks current user membership/role and the asset. Review decisions acquire
 // an exclusive asset lock to serialize competing acceptance decisions.
 const lock=options.lockAssetForReview ? 'FOR UPDATE OF a FOR SHARE OF actor' : 'FOR SHARE OF a,actor';
 const result=await tx.query(`SELECT a.id,a.asset_type,a.created_by,actor.role
  FROM assets a JOIN users actor ON actor.id=$3 AND actor.organization_id=a.organization_id AND actor.suspended_at IS NULL
  WHERE a.id=$1 AND a.organization_id=$2 ${lock}`,[assetId,actor.organizationId,actor.id]);
 const current=result.rows[0];
 if(!current)throw new NotFoundException('Asset not found or organization membership changed');
 if(options.allowedActorRoles && !options.allowedActorRoles.includes(current.role))
  throw new ForbiddenException('Current role is not permitted for this operation');
 if(current.role==='ORG_ADMIN'||current.created_by===actor.id)return {assetType:current.asset_type};
 // Case access is not inherited from arbitrary asset read-only grants.
 const cases=await tx.query(`SELECT c.id FROM verification_cases c
  WHERE c.asset_id=$1 AND c.organization_id=$2 AND (c.created_by=$3 OR c.assigned_to=$3)
  LIMIT 1 FOR SHARE`,[assetId,actor.organizationId,actor.id]);
 if(cases.rows.length)return {assetType:current.asset_type};
 // Lock the exact contributing grant. A concurrent DELETE or READ downgrade
 // must wait until this transaction finishes (or win before this SELECT).
 const grants=await tx.query(`SELECT g.id FROM resource_grants g
  WHERE g.asset_id=$1 AND g.organization_id=$2 AND g.grantee_id=$3
    AND g.permission='CONTRIBUTE' AND g.expires_at>now()
  LIMIT 1 FOR SHARE`,[assetId,actor.organizationId,actor.id]);
 if(!grants.rows.length)throw new ForbiddenException('Current asset contribution permission required');
 return {assetType:current.asset_type};
}

export async function requireCurrentCaseContribution(tx:Queryable,actor:Actor,caseId:string):Promise<{assetId:string}>{
 // Locks both the confidential case and current user role. Asset grants alone
 // do not authorize access to case evidence or attachments.
 const {rows}=await tx.query(`SELECT c.asset_id,c.created_by,c.assigned_to,actor.role
  FROM verification_cases c JOIN users actor ON actor.id=$3 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
  WHERE c.id=$1 AND c.organization_id=$2 FOR SHARE OF c,actor`,[caseId,actor.organizationId,actor.id]);
 const c=rows[0];
 if(!c||!(c.role==='ORG_ADMIN'||c.created_by===actor.id||c.assigned_to===actor.id))
  throw new ForbiddenException('Current case participation required');
 return {assetId:c.asset_id};
}


/** v0.73 document-read authorization. These locks serialize document reads
 * with membership updates, reassignment and grant revocation. They must be
 * acquired in the SAME transaction as the document metadata lookup and the
 * encrypted-blob read; a preflight HTTP access check is not sufficient.
 */
export async function requireCurrentAssetRead(tx:Queryable,actor:Actor,assetId:string):Promise<void>{
 const {rows}=await tx.query(`SELECT a.id,a.created_by,actor.role
  FROM assets a JOIN users actor ON actor.id=$3 AND actor.organization_id=a.organization_id AND actor.suspended_at IS NULL
  WHERE a.id=$1 AND a.organization_id=$2 FOR SHARE OF a,actor`,[assetId,actor.organizationId,actor.id]);
 const a=rows[0];
 if(!a)throw new NotFoundException('Asset not found or organization membership changed');
 if(a.role==='ORG_ADMIN'||a.created_by===actor.id)return;
 const cases=await tx.query(`SELECT c.id FROM verification_cases c
   WHERE c.asset_id=$1 AND c.organization_id=$2 AND (c.created_by=$3 OR c.assigned_to=$3)
   LIMIT 1 FOR SHARE`,[assetId,actor.organizationId,actor.id]);
 if(cases.rows.length)return;
 const grants=await tx.query(`SELECT g.id FROM resource_grants g
   WHERE g.asset_id=$1 AND g.organization_id=$2 AND g.grantee_id=$3 AND g.expires_at>now()
   LIMIT 1 FOR SHARE`,[assetId,actor.organizationId,actor.id]);
 if(!grants.rows.length)throw new ForbiddenException('Current asset read permission required');
}

/** A general asset READ grant never exposes confidential case documents. */
export async function requireCurrentCaseRead(tx:Queryable,actor:Actor,caseId:string):Promise<void>{
 const {rows}=await tx.query(`SELECT c.id,c.created_by,c.assigned_to,actor.role
   FROM verification_cases c JOIN users actor ON actor.id=$3 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
   WHERE c.id=$1 AND c.organization_id=$2 FOR SHARE OF c,actor`,[caseId,actor.organizationId,actor.id]);
 const c=rows[0];
 if(!c||!(c.role==='ORG_ADMIN'||c.created_by===actor.id||c.assigned_to===actor.id))
  throw new ForbiddenException('Current case participation required');
}


/** v0.74: a JWT role claim is never enough to authorize grant management.
 * Lock the active administrator membership in the SAME tenant-scoped write
 * transaction; a concurrent suspension/demotion must serialize with this
 * operation. This guard may only be called after setTenantScope(tx, orgId).
 */
export async function requireCurrentOrganizationAdmin(tx:Queryable,actor:Actor):Promise<void>{
 const {rows}=await tx.query(`SELECT id,role FROM users
  WHERE id=$1 AND organization_id=$2 AND suspended_at IS NULL FOR SHARE`,
  [actor.id,actor.organizationId]);
 if(rows.length!==1||rows[0].role!=='ORG_ADMIN')
  throw new ForbiddenException('Current organization administrator membership required');
}


/** v0.75: defend new asset creation against a role/suspension transition
 * between authentication and the INSERT. The FOR SHARE lock must be retained
 * through the write and audit in the SAME tenant-scoped transaction.
 */
export async function requireCurrentOrganizationRole(
 tx:Queryable,actor:Actor,allowedRoles:readonly string[]
):Promise<void>{
 const {rows}=await tx.query(`SELECT id,role FROM users
  WHERE id=$1 AND organization_id=$2 AND suspended_at IS NULL FOR SHARE`,
  [actor.id,actor.organizationId]);
 if(rows.length!==1||!allowedRoles.includes(rows[0].role))
  throw new ForbiddenException('Current organization role is not permitted for this operation');
}

/** v0.76: lock the current actor AND target case in a single statement.
 * Unlike a FOR SHARE read followed by FOR UPDATE, this lock order avoids
 * case-row lock upgrade deadlocks between concurrent dispute reporters.
 * Call only after tenant scope has been set in the write transaction.
 */
export async function requireCurrentCaseMutation(tx:Queryable,actor:Actor,caseId:string):Promise<{status:string;assetId:string}>{
 const {rows}=await tx.query(`SELECT c.id,c.status,c.asset_id,c.created_by,c.assigned_to,actor.role
   FROM verification_cases c
   JOIN users actor ON actor.id=$3 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
   WHERE c.id=$1 AND c.organization_id=$2 FOR UPDATE OF c FOR SHARE OF actor`,
   [caseId,actor.organizationId,actor.id]);
 const c=rows[0];
 if(!c||!(c.role==='ORG_ADMIN'||c.created_by===actor.id||c.assigned_to===actor.id))
  throw new ForbiddenException('Current case participation required');
 return {status:c.status,assetId:c.asset_id};
}


/** v0.77: serialize dispute changes for ALL cases belonging to the same asset.
 * The first query is only a permission-aware locator, not an authorization
 * decision: the caller MUST still lock/check current authority after the asset
 * lock, in the SAME transaction as its dispute mutation.
 * Lock order: asset FOR UPDATE -> case FOR UPDATE -> dispute FOR UPDATE.
 */
export async function lockCurrentDisputeAsset(tx:Queryable,actor:Actor,caseId:string):Promise<string>{
 const {rows}=await tx.query(`SELECT c.asset_id
  FROM verification_cases c JOIN users actor
    ON actor.id=$3 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
  WHERE c.id=$1 AND c.organization_id=$2
    AND (actor.role='ORG_ADMIN' OR c.created_by=actor.id OR c.assigned_to=actor.id)`,
  [caseId,actor.organizationId,actor.id]);
 if(rows.length!==1)throw new ForbiddenException('Current case participation required');
 const assetId=rows[0].asset_id;
 const locked=await tx.query(`SELECT id FROM assets
   WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[assetId,actor.organizationId]);
 if(locked.rows.length!==1)throw new NotFoundException('Disputed asset is unavailable');
 return assetId;
}
