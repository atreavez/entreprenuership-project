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

/** Current administrator read authority, including session validity. Call
 * inside the same transaction as the sensitive read. Revocation and role
 * changes serialize with the row locks. A token's role is not authoritative.
 */
export async function assertCurrentAdminSession(tx:Queryable,actor:UserAuth,sessionId:string):Promise<void>{
 if(typeof sessionId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))
  throw new ForbiddenException('Current administrator session required');
 const {rows}=await tx.query(`SELECT u.id FROM users u
  JOIN auth_sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id
  WHERE u.id=$1 AND u.organization_id=$2 AND u.role='ORG_ADMIN' AND u.suspended_at IS NULL
    AND s.id=$3 AND s.revoked_at IS NULL
    AND s.expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
  FOR SHARE OF u,s`,[actor.id,actor.organizationId,sessionId]);
 if(rows.length!==1)throw new ForbiddenException('Current administrator session required');
}
export async function assertCurrentPlatformAdminSession(tx:Queryable,actor:UserAuth,sessionId:string):Promise<void>{
 await assertCurrentAdminSession(tx,actor,sessionId);
 const {rows}=await tx.query('SELECT user_id FROM platform_admin_appointments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE',[actor.id]);
 if(rows.length!==1)throw new ForbiddenException('Current platform administrator appointment required');
}
