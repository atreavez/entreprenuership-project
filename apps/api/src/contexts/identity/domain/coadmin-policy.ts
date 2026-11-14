/** V27 pure co-admin invitation domain policy; no framework or database imports. */
export const COADMIN_INVITE_TTL_MS = 60 * 60 * 1000;
export const COADMIN_STEP_UP_TTL_MS = 5 * 60 * 1000;
export type CoAdminInvitation = {role: string; expires_at: Date | string;accepted_at?: Date | string | null;revoked_at?: Date | string | null};
export function canAcceptCoAdminInvitation(inv:CoAdminInvitation|null|undefined,now: number):boolean {
 if(!inv || inv.role!=='ORG_ADMIN' || inv.accepted_at || inv.revoked_at) return false;
 const exp = new Date(inv.expires_at).getTime();
 return Number.isFinite(exp) && exp > now;
}
/** Exact request routes available while a newly invited administrator enrolls MFA. */
export function isCoAdminEnrollmentRoute(path:string):boolean {
 return new Set([
  '/api/v1/auth/me','/api/v1/auth/mfa/status','/api/v1/auth/mfa/enroll',
  '/api/v1/auth/mfa/confirm','/api/v1/auth/logout','/api/v1/auth/logout-all',
  '/api/v1/auth/password/change','/api/v1/auth/sessions','/api/v1/auth/sessions/revoke'
 ]).has(path);
}

/** v0.82. Administrator MFA is a role invariant, not a historical row flag.
 * The legacy admin_mfa_required flag remains a stronger policy for other roles.
 */
export function requiresAdminMfa(role:string,configuredFlag?:boolean):boolean{
 return role==='ORG_ADMIN'||configuredFlag===true;
}
/** A live MFA credential alone is not proof for a particular access-token session.
 * AuthGuard obtains the timestamp from that exact authenticated session in PostgreSQL.
 */
export function hasAdminSessionMfaProof(enabled:unknown,verifiedAt:unknown):boolean{
 return enabled===true && verifiedAt!==null && verifiedAt!==undefined;
}
