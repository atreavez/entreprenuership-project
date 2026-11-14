/** Same-transaction role, membership, case-stage and professional trust check.
 * FOR UPDATE OF c serializes case reassignment with case decisions; FOR SHARE
 * OF actor,assignee holds user membership and roles until commit.
 */
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { canAssignCaseStage } from '../domain/evidence-policy';

type Queryable={query(sql:string,params?:unknown[]):Promise<{rows:any[]}>};
type Actor={id:string;organizationId:string};
export async function requireCurrentCaseAssignment(
 tx:Queryable,actor:Actor,caseId:string,assigneeId:string
):Promise<void>{
 const {rows}=await tx.query(`SELECT c.id,c.stage,c.status,
    actor.role AS actor_role,assignee.role AS assignee_role
   FROM verification_cases c
   JOIN users actor ON actor.id=$4 AND actor.organization_id=c.organization_id AND actor.suspended_at IS NULL
   JOIN users assignee ON assignee.id=$1 AND assignee.organization_id=c.organization_id AND assignee.suspended_at IS NULL
   WHERE c.id=$2 AND c.organization_id=$3
   FOR UPDATE OF c FOR SHARE OF actor,assignee`,[assigneeId,caseId,actor.organizationId,actor.id]);
 const current=rows[0];
 if(!current)throw new NotFoundException('Case, administrator or organization assignee not found');
 if(current.actor_role!=='ORG_ADMIN')throw new ForbiddenException('Current organization administrator role required');
 if(current.status!=='OPEN')throw new ConflictException('Closed or blocked case cannot be reassigned');
 if(!canAssignCaseStage(current.stage,current.assignee_role))
  throw new ForbiddenException('Assignee role is not qualified for current case stage');
 if(current.assignee_role==='SURVEYOR'||current.assignee_role==='LEGAL_REVIEWER'){
  const accreditation=await tx.query(`SELECT p.user_id FROM professional_accreditations p
   WHERE p.user_id=$1 AND p.professional_role=$2
    AND p.revoked_at IS NULL AND p.expires_at>now()
   FOR SHARE OF p`,[assigneeId,current.assignee_role]);
  if(!accreditation.rows.length)throw new ForbiddenException('Assignee needs active professional accreditation');
 }
}
