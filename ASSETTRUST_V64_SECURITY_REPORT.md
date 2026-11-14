# AssetTrust v0.64 — Security gate and independent-evidence status

**Decision:** NOT READY FOR PRODUCTION / NO-GO (11 November 2026)

## Existing protections preserved in source

- Global Platform Super Admin and scoped Organization Admin controls; configured/approved settings, workflow edits, provider staging and immutable audit evidence remain in the prior source.
- Application auth, MFA, server checks and restricted tenant RLS policy catalogue have v0.63 offline policy tests (31 passing); this does not establish live efficacy.
- 13 protected PostgreSQL tables and 16 reviewed policies covered by the v0.63 contract; no policy migrations were modified in this milestone.
- v0.64 adds an explicit test-environment-only prerequisite gate for executable integration, a separate restricted database account requirement, a second exact-database-name confirmation, protected evidence output and fail-closed refusal on missing build/lockfile conditions.

## Critical gaps blocking release

1. Supply-chain: generate and review authentic npm lockfile and confirm clean install, audit, API/React compile. Current archive intentionally lacks the lockfile/dependencies.
2. Database: prove live nonowner runtime role, tenant isolation and recipient-specific access against actual disposable PostGIS; staged RLS drift cannot be inferred from unit mocks.
3. Application: exercise actual authenticated roles, admin APIs, verification approvals, document ingestion/ClamAV, immutable report verification and payment amount server-side authority.
4. Infrastructure: test HTTPS/TLS, secure cookies, CSRF, SSH perimeter, secret stores, rate limiting, upload storage permissions, backups and disaster recovery.
5. Assurance: original Git history search/credential rotation as required, independent adversarial testing, evidence retention, Uganda-specific legal/regulatory review and documented sign-off.

**Implementation verification, not claims, is required for every release gate.** No version number or percentage is evidence of release readiness. The v0.64 runner cannot output `productionApproved: true`.
