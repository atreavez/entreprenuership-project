# AssetTrust v0.84 — Security Assessment

**Assessment date:** 12 November 2026. **Release:** **NO-GO**. This report is an authoring-stage assessment and not independent penetration testing or production authorization.

## Findings addressed in the v0.84 application source

| ID | Risk | Implemented mitigation | Verified evidence |
|---|---|---|---|
| AUTH-84-01 | Optional MFA removal uses current-password validation **before** the transaction, which can go stale after a password change/reset | Lock active user and current role using `FOR SHARE` before verifying password inside the same transaction | v84 fault-injection and sequencing tests PASS; live race PENDING |
| AUTH-84-02 | MFA step-up can rely on a suspended identity or a session that has just been revoked/expired | Lock current active user, then MFA credential; update MFA proof only for an unrevoked, unexpired, same-organization session with `RETURNING` proof | v84 offline tests PASS; live PostgreSQL PENDING |
| AUTH-84-03 | A successful TOTP can advance a replay counter while the session is no longer eligible for MFA proof | Write session proof first, then advance credential step atomically; failures roll back with audit | v84 offline fault injection PASS; live PENDING |
| AUTH-84-04 | MFA confirmation can report success while the enrollment session no longer exists/is revoked | Tenant-scoped, expiry-checked `UPDATE auth_sessions ... RETURNING id`, reject zero rows and roll back activation/recovery-codes | v84 offline tests PASS; live PENDING |
| AUTH-84-05 | MFA removal from a revoked session can disable credentials | Validate and lock a currently active same-organization session before deleting MFA state | v84 offline tests PASS; live PENDING |

The mandatory administrator-MFA invariant remains in place. All changed SQL uses parameter placeholders. No SQL migrations changed; the existing 27-file reviewed RLS contract remains as in v0.83, **not** re-certified against real PostgreSQL.

## Verification boundary

- 28/28 new tests pass; 44/44 version suites pass; 872 counted tests, architecture, syntax, imports and CI policy pass.
- Limited snapshot secret scanner found zero high-confidence matches; not a full vulnerability, malware, Git-history or credentials review.
- Authentic npm lockfile absent; full dependency install and API/web compilation not verified. The `npm run build` failure here contains missing NestJS/Node packages. It is **not** proof all source typechecks pass.
- PostgreSQL, transaction deadlocks, RLS, MFA browser onboarding, cookies, ClamAV, mobile/browser compatibility, container deployment, payment integrity and independent attack simulation have **NOT** been executed as part of this milestone.

## Mandatory release work

Complete audited lockfile and `npm ci`, `npm audit`, compiled API/web, real PostgreSQL transaction and tenant-isolation tests, full authenticated browser/E2E, secure reset/login/MFA abuse prevention, payment authority, upload scanning, TLS/SSH configuration, original Git-history secret scan and key rotation where necessary, disaster-recovery and deployment rollbacks, and signed independent security findings. Any critical/high-severity issue blocks release.

**Verdict:** accepted only as a source-development checkpoint; **production NO-GO**.
