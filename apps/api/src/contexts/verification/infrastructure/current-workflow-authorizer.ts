/**
 * PostgreSQL adapter: read CURRENT authorization inside the transaction which
 * will accept evidence or advance the case. A token's cached role and
 * professionalApproved flag must not authorize irreversible case decisions.
 * Case row is locked by the workflow repository before calling this adapter.
 */
import { ForbiddenException } from '@nestjs/common';
import type { ReviewActor, Role } from '../domain/evidence-policy';

type Queryable = { query(sql:string,params?:unknown[]):Promise<{rows:any[]}> };

export async function loadCurrentWorkflowActor(
 tx:Queryable, actor:ReviewActor, _stage:string
):Promise<ReviewActor>{
 const current=await tx.query(`SELECT u.role FROM users u
  WHERE u.id=$1 AND u.organization_id=$2 AND u.suspended_at IS NULL FOR SHARE OF u`,[actor.id,actor.organizationId]);
 if(!current.rows.length)throw new ForbiddenException('Current organization membership is required');
 const role=current.rows[0].role as Role;
 if(!['ORG_ADMIN','CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'].includes(role))
  throw new ForbiddenException('Current role is invalid');
 let professionalApproved=false;
 if(role==='SURVEYOR'||role==='LEGAL_REVIEWER'){
  const active=await tx.query(`SELECT p.user_id FROM professional_accreditations p
    WHERE p.user_id=$1 AND p.professional_role=$2
    AND p.revoked_at IS NULL AND p.expires_at>now()
    FOR SHARE OF p`,[actor.id,role]);
  professionalApproved=active.rows.length===1;
 }
 return {id:actor.id,organizationId:actor.organizationId,role,professionalApproved};
}
