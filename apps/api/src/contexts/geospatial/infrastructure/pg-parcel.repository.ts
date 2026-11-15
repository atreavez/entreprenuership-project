import {setTenantScope} from '../../../contexts/tenant-isolation/application/tenant-scope';
import { Injectable, BadRequestException,ForbiddenException,NotFoundException,ConflictException } from '@nestjs/common';
import { Database } from '../../../database';
import { AuditService } from '../../../audit';
import { uid,isUuid,type UserAuth } from '../../../common';
import type {BoundaryActor,BoundaryStore,BoundarySource} from '../application/parcel-usecases';
import type {ParcelPolygon} from '../domain/parcel-boundary';
import {canReviewBoundary} from '../domain/parcel-boundary';
import {requireCurrentAssetContribution} from '../../../contexts/access/infrastructure/transactional-access';
const projection=`p.id,p.asset_id,p.source_kind,p.source_reference,p.notes,p.status,p.submitted_by,p.reviewed_by,p.review_notes,p.created_at,p.submitted_at,p.reviewed_at,ROUND(ST_Area(p.geometry::geography)::numeric,2)::float AS area_sqm,ST_AsGeoJSON(p.geometry)::json AS geometry`;
@Injectable()
export class PgParcelRepository implements BoundaryStore{
 constructor(private readonly db:Database,private readonly audit:AuditService){}
 async list(u:BoundaryActor,assetId:string){const {rows}=await this.db.tenantQuery(u.organizationId,`SELECT ${projection} FROM parcel_boundary_claims p WHERE p.organization_id=$1 AND p.asset_id=$2 ORDER BY created_at DESC LIMIT 100`,[u.organizationId,isUuid(assetId)]);return rows}
 async create(u:BoundaryActor,assetId:string,claim:{geometry:ParcelPolygon;sourceKind:BoundarySource;sourceReference:string;notes:string}){
  const id=uid();await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   const asset=await requireCurrentAssetContribution(tx,u,isUuid(assetId));
   if(asset.assetType!=='LAND')throw new BadRequestException('Only land assets can have parcel boundaries');
   await tx.query(`INSERT INTO parcel_boundary_claims(id,organization_id,asset_id,geometry,source_kind,source_reference,notes,submitted_by)
       VALUES($1,$2,$3,ST_SetSRID(ST_GeomFromGeoJSON($4::text),4326),$5,$6,$7,$8)`,[id,u.organizationId,assetId,JSON.stringify(claim.geometry),claim.sourceKind,claim.sourceReference,claim.notes,u.id]);
   await this.audit.write(tx,u as UserAuth,'PARCEL_DRAFT_CREATED','asset',assetId,{claimId:id,sourceKind:claim.sourceKind});
  });return {id,status:'DRAFT'};
 }
 async submit(u:BoundaryActor,assetId:string,claimId:string){await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
  await requireCurrentAssetContribution(tx,u,isUuid(assetId));
  const result=await tx.query(`UPDATE parcel_boundary_claims SET status='SUBMITTED',submitted_at=now()
    WHERE id=$1 AND organization_id=$2 AND asset_id=$3 AND submitted_by=$4 AND status='DRAFT' RETURNING id`,[isUuid(claimId),u.organizationId,isUuid(assetId),u.id]);
  if(!result.rows.length)throw new ConflictException('Only the creator can submit an active draft');
  await this.audit.write(tx,u as UserAuth,'PARCEL_CLAIM_SUBMITTED','asset',assetId,{claimId});
 });return {id:claimId,status:'SUBMITTED'};}
 async review(u:BoundaryActor,sessionId:string,assetId:string,claimId:string,decision:'ACCEPTED'|'REJECTED',notes:string){
  if(u.role!=='SURVEYOR'||!u.professionalApproved)throw new ForbiddenException('Current accredited surveyor status required');
  await this.db.transaction(async tx=>{
   await setTenantScope(tx,u.organizationId);
   // Security-critical authorization is revalidated *inside* the review transaction.
   // The actor's professionalApproved flag was computed at request authentication
   // and may now be stale (revocation, expiration or role/org reassignment).
   // Locks serialize review against concurrent accreditation revocation, MFA
   // disable, session revocation and account-role changes. Do not remove them.
   const step=await tx.query(`SELECT 1 FROM auth_sessions s
     JOIN auth_mfa_credentials m ON m.user_id=s.user_id
     JOIN users u ON u.id=s.user_id
     JOIN professional_accreditations p ON p.user_id=u.id AND p.professional_role=u.role
     WHERE s.id=$1 AND s.user_id=$2 AND u.organization_id=$3 AND u.role='SURVEYOR' AND u.suspended_at IS NULL
     AND s.revoked_at IS NULL AND s.expires_at > now() AND m.enabled=true
     AND s.mfa_verified_at > now()-interval '15 minutes'
     AND p.revoked_at IS NULL AND p.expires_at > now()
     FOR SHARE OF s,m,u,p`,[isUuid(sessionId),u.id,u.organizationId]);
   if(!step.rows.length)throw new ForbiddenException('Fresh MFA verification required');
   // Lock the asset exclusively, while rechecking live contribution rights.
   // This serializes concurrent acceptance and grant/role revocation.
   await requireCurrentAssetContribution(tx,u,isUuid(assetId),{lockAssetForReview:true});
   const claim=await tx.query(`SELECT submitted_by,status FROM parcel_boundary_claims WHERE id=$1 AND asset_id=$2 AND organization_id=$3 FOR UPDATE`,[isUuid(claimId),assetId,u.organizationId]);
   if(!claim.rows.length)throw new NotFoundException('Boundary claim not found');
   if(!canReviewBoundary(u,claim.rows[0].submitted_by))throw new ForbiddenException('Only a different accredited surveyor may review');
   if(claim.rows[0].status!=='SUBMITTED')throw new ConflictException('Only submitted claims can be reviewed');
   if(decision==='ACCEPTED')await tx.query("UPDATE parcel_boundary_claims SET status='SUPERSEDED' WHERE asset_id=$1 AND organization_id=$2 AND status='ACCEPTED'",[assetId,u.organizationId]);
   await tx.query(`UPDATE parcel_boundary_claims SET status=$1,reviewed_by=$2,review_notes=$3,reviewed_at=now()
     WHERE id=$4 AND organization_id=$5 AND asset_id=$6`,[decision,u.id,notes,claimId,u.organizationId,assetId]);
   await this.audit.write(tx,u as UserAuth,'PARCEL_CLAIM_REVIEWED','asset',assetId,{claimId,decision});
  });return {id:claimId,status:decision};
 }
 async overlaps(u:BoundaryActor,assetId:string,claimId:string){
  // The subject asset access is checked by the controller. Never disclose a different
  // organization's property or an asset the caller cannot independently access.
  const {rows}=await this.db.tenantQuery(u.organizationId,`
    WITH subject AS (
      SELECT id, geometry, asset_id FROM parcel_boundary_claims
      WHERE id=$1 AND asset_id=$2 AND organization_id=$3
        AND (status IN ('ACCEPTED','SUBMITTED') OR submitted_by=$4)
      LIMIT 1
    ), accessible_candidates AS (
      SELECT other.id AS claim_id, other.geometry, other.asset_id, a.asset_code
      FROM subject s
      JOIN parcel_boundary_claims other ON other.organization_id=$3
        AND other.asset_id <> s.asset_id AND other.status='ACCEPTED'
        AND ST_Intersects(other.geometry,s.geometry)
      JOIN assets a ON a.id=other.asset_id AND a.organization_id=$3
      WHERE ($5::boolean OR a.created_by=$4
        OR EXISTS(SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=$3
          AND (c.created_by=$4 OR c.assigned_to=$4))
        OR EXISTS(SELECT 1 FROM resource_grants g WHERE g.organization_id=$3 AND g.asset_id=a.id
          AND g.grantee_id=$4 AND g.expires_at>now()))
      ORDER BY other.created_at DESC LIMIT 40
    )
    SELECT other.claim_id,other.asset_code,
      ST_Area(intersection.geom::geography) AS intersection_sqm,
      ST_Area(s.geometry::geography) AS subject_area_sqm,
      ST_Area(other.geometry::geography) AS other_area_sqm
    FROM subject s JOIN accessible_candidates other ON ST_Intersects(s.geometry,other.geometry)
    CROSS JOIN LATERAL (SELECT ST_CollectionExtract(ST_Intersection(s.geometry,other.geometry),3) AS geom) intersection
    WHERE NOT ST_IsEmpty(intersection.geom) AND ST_Area(intersection.geom::geography) > 0
    ORDER BY intersection_sqm DESC LIMIT 20
  `,[isUuid(claimId),isUuid(assetId),u.organizationId,u.id,u.role==='ORG_ADMIN']);
  return rows;
 }
 async search(u:BoundaryActor,bbox:[number,number,number,number]){
  const {rows}=await this.db.tenantQuery(u.organizationId,`SELECT ${projection},a.asset_code,a.district
  FROM parcel_boundary_claims p JOIN assets a ON a.id=p.asset_id AND a.organization_id=p.organization_id
  WHERE p.organization_id=$1 AND p.geometry && ST_MakeEnvelope($2,$3,$4,$5,4326)
   AND (p.status='ACCEPTED' OR p.submitted_by=$6)
   AND ($7::boolean OR a.created_by=$6 OR EXISTS(SELECT 1 FROM verification_cases c WHERE c.asset_id=a.id AND c.organization_id=$1 AND (c.created_by=$6 OR c.assigned_to=$6))
      OR EXISTS(SELECT 1 FROM resource_grants g WHERE g.organization_id=$1 AND g.asset_id=a.id AND g.grantee_id=$6 AND g.expires_at>now()))
   ORDER BY p.created_at DESC LIMIT 100`,[u.organizationId,...bbox,u.id,u.role==='ORG_ADMIN']);return rows;
 }
}
