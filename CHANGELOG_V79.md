# AssetTrust v0.79 — Live-role protection for confidential reads

## Source change

The dashboard previously calculated organization-wide visibility from the role stored in a JWT. Audit history/list and the integrations audit-head/status endpoints also trusted the same cached administrator claim. Case summary reports checked permissions in a separate transaction from the confidential case/evidence reads.

v0.79 now uses transaction-scoped, locked current membership for dashboard statistics, audit verification/history, and integration status/local proof. The case report checks current case participation, loads case details and evidence, and loads the published copy in the **same tenant-scoped transaction**. A suspended or demoted user is rejected before sensitive records are read. The new `current-read-authority.ts` is an infrastructure adapter; no domain policy gains a framework dependency.

## Verifications

- 23 new v0.79 tests passed; 39/39 v0.41–v0.79 suites passed, 718 TAP cases.
- Syntax/architecture/CI/source import checks passed.
- No SQL migration or RLS policy changes. All existing 27 migrations retained.
- Real NestJS/React compilation, live PostgreSQL/PostGIS, authenticated HTTP, browser acceptance and final release security gate remain **UNVERIFIED/BLOCKED**. A real npm lockfile is absent; the npm registry cannot resolve in this packaging environment.
- This is **not** a production release.
