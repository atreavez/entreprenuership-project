# AssetTrust v0.74 — Security assessment (source checkpoint)

**Decision:** **NO-GO for production.** Scope: stale-role authorization at document listing and asset-grant administration; tests run only offline.

## Threat and remediation

**Threat:** A previously signed administrator JWT continues to claim ORG_ADMIN after a role change or suspension. Older list/create/revoke grant paths trusted that claim for privileged behavior. The document list used `u.role==='ORG_ADMIN'` to bypass per-document visibility. An attacker controlling an outdated token might access document metadata or manage grants before token expiry.

**Mitigation:** Current membership and role are re-evaluated inside tenant-scoped SQL. Grant operations acquire a `FOR SHARE` lock on the actor's active member row in the same PostgreSQL transaction as grant writes/audit. A target asset and prospective grantee are checked against the current organization. The document list joins a currently active actor and uses its current database role; confidential case-level access remains separate from general asset grants.

## Verified offline

- 19 new v74 tests and all 34 regression suites (574 counted TAP passes).
- Failures modeled for demoted/suspended administrators, absent assets, inactive grantees, failed writes, unauthorized case listings.
- Static architecture/CI/syntax checks and limited source-only credential scan passed.
- Existing SQL migrations and reviewed RLS policy contract were not modified.

## Release blockers

- No authentic npm lockfile, installed application dependencies or complete successful build.
- No real PostgreSQL connection; row-lock serialization, RLS and updated endpoint behavior remain unverified live.
- No complete Git-history scan, independent security review, public-network exposure assessment, browser workflows, backup/restore proof, or payment/refund abuse testing.
- Other services may still use stale JWT role claims. A platform-wide query/service/controller authorization audit must follow, including asset creation/listing, case flows, exports, tenant organization admin controls and privileged financial configuration.

**Mandatory security practices:** DDD, TDD, SOLID and Clean Architecture boundaries; real Argon2id/bcrypt credentials, short-lived tokens, secure HttpOnly cookies, MFA for privileged actions, server-side input validation, per-tenant DB/RLS enforcement, full history credential audit and rotation, secure uploads/malware screening, TLS/restricted SSH, CSRF and abuse protections, server-validated payments, and independent negative/restore/deployment tests. Block release until all critical findings and approval gates are resolved.
