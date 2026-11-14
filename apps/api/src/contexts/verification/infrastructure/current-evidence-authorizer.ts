/**
 * Infrastructure adapter: check CURRENT case submission authority inside the
 * same PostgreSQL transaction as case_evidence INSERT.
 *
 * FOR UPDATE OF c serializes assignment/stage/dispute decisions with concurrent
 * updates. FOR SHARE OF actor protects role and organization membership; the
 * accredited professional row is locked when a professional stage requires it.
 */
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';

type Queryable = {query(sql:string,params?:unknown[]):Promise<{rows:any[]}>};
type Actor = {id:string;organizationId:string};
const professionalRoleForStage:Readonly<Record<string,string>> = {
 FIELD_INSPECTION:'SURVEYOR',LEGAL_REVIEW:'LEGAL_REVIEWER'
};

export async function requireCurrentEvidenceSubmission(
 tx:Queryable,actor:Actor,caseId:string,expectedStage:string
):Promise<{assetId:string;stage:string}> {
 const {rows}=await tx.query(`SELECT c.id,c.asset_id,c.stage,c.status,c.assigned_to,actor.role
  FROM verification_cases c
  JOIN users actor ON actor.id=$3 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
  WHERE c.id=$1 AND c.organization_id=$2
  FOR UPDATE OF c FOR SHARE OF actor`,[caseId,actor.organizationId,actor.id]);
 const current=rows[0];
 if(!current)throw new NotFoundException('Case not found or organization membership changed');
 if(current.status!=='OPEN'||current.stage!==expectedStage)
  throw new ConflictException('Case stage changed or case is not open; reload and retry');
 if(current.role!=='ORG_ADMIN'&&current.assigned_to!==actor.id)
  throw new ForbiddenException('Current case assignment required');
 const requiredRole=professionalRoleForStage[current.stage];
 if(requiredRole){
  if(current.role!==requiredRole)throw new ForbiddenException('Current professional role required');
  const accreditation=await tx.query(`SELECT p.user_id FROM professional_accreditations p
   WHERE p.user_id=$1 AND p.professional_role=$2 AND p.revoked_at IS NULL AND p.expires_at>now()
   LIMIT 1 FOR SHARE`,[actor.id,requiredRole]);
  if(!accreditation.rows.length)throw new ForbiddenException('Current professional accreditation required');
 }else if(current.stage==='FINAL_REVIEW'){
  if(current.role!=='ORG_ADMIN')throw new ForbiddenException('Organization administrator required');
 }else if(current.role!=='ORG_ADMIN'&&current.role!=='REVIEWER'){
  throw new ForbiddenException('Current evidence reviewer role required');
 }
 return {assetId:current.asset_id,stage:current.stage};
}
