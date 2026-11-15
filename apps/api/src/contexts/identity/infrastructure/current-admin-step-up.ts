import {ForbiddenException} from '@nestjs/common';
import type {UserAuth} from '../../../common';

type Queryable={query(sql:string,params?:unknown[]):Promise<{rows:any[]}>};
/** Validate CURRENT role, active MFA and recent session step-up under row locks.
 * Never grant privileged invitations using claims captured at login.
 */
export async function assertCurrentAdminStepUp(tx:Queryable,actor:UserAuth,sessionId:string):Promise<void>{
 const result=await tx.query(`SELECT u.id FROM users u
  JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
  JOIN auth_mfa_credentials m ON m.user_id=u.id
  WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
    AND s.id=$3 AND s.revoked_at IS NULL
    AND s.expires_at>now() AND s.absolute_expires_at>now()
    AND s.mfa_verified_at>now()-interval '5 minutes'
    AND m.enabled=true
  FOR SHARE OF u,s,m`,[actor.id,actor.organizationId,sessionId]);
 if(result.rows.length!==1)throw new ForbiddenException('Current administrator role and fresh MFA verification required');
}
