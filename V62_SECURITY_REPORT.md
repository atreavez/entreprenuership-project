# AssetTrust v0.62 — Security and release assessment
**Date:** 11 November 2026  
**Decision:** **NO-GO / DEVELOPMENT CHECKPOINT ONLY**

## Security work completed in source

- Added forced PostgreSQL RLS to four operational tables: `case_tasks`, `disputes`, `monitoring_reminders`, `verification_quotes`.
- Added forced RLS to `notifications` with organization **and recipient** requirements for reads and mark-read updates; notification insertion requires a matching organization.
- Added 12 composite organization foreign keys to enforce relationship integrity across cases/assets/users/recipients; migration aborts on historical discrepancies.
- Updated notification API reads/writes to run within transaction-scoped tenant plus authenticated-actor context.
- Updated production startup and CI restricted database role guards for 13 RLS tables; corrected three pre-existing live runners that queried a stale eight-table inventory.
- Added an explicitly authorized, disposable two-organization PostgreSQL integration test, with same-organization recipient separation and cross-org FK probes; **not executed live in this environment**.
- Added a read-only historical-data integrity preflight and RLS catalog inspection scripts.

## Evidence and limits

New v0.62 unit/security tests, historical version suites, architecture/syntax/CI gates and current-source credential scans passed in the offline environment (see `TEST_EVIDENCE_V62.md`). However, TypeScript *transpilation* is not a clean full TypeScript compilation and the static build gate is not a running frontend.

The authentic npm lockfile and dependencies are absent. `npm ci` and the full API build fail. The release preflight reports **3 of 11 prerequisites present**. There is no PostgreSQL/ClamAV service or deployable authenticated browser available in this environment; therefore real RLS enforcement, migrations, upload malware scanning, simultaneous API sessions, TLS and restore tests remain unverified.

## Risks requiring resolution

1. Applying migration 027 before a compatible v0.62 API rollout will break notification reads; apply under coordinated staging-tested maintenance.
2. Existing records with cross-tenant references will cause migration 027 to fail, intentionally; review the 12 preflight probes.
3. RLS does not guarantee application-level authorization if server credentials or SQL access are compromised; the tenant and actor GUCs are application-controlled, so parameterized SQL, least privilege and independent testing remain mandatory.
4. Other sensitive tables remain outside this staged RLS rollout; this is not a system-wide tenant isolation certificate.
5. The platform is not an official land-title certification service without appropriate authorized registry integrations and legal review.

## Release verdict

**NO-GO.** Require authentic dependency graph, successful clean builds, live seeded PostgreSQL tests with separate restricted login, passing HTTP/browser tests, ClamAV, full Git-history scan, independent security review and operational readiness before handling real users or payments.
