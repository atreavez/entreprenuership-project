# AssetTrust v0.75 — Engineering handover

**Date:** 12 November 2026  
**Base:** v0.74 (no reset)  
**Release decision:** **NO-GO** — source-level acceptance only; no successful dependency-backed build or live PostgreSQL/API acceptance.

## Implemented change: current-role guarded asset/case journeys

The v0.74 change protected document-list and grant administration. v0.75 extends current database membership checks to further core API reads and writes. While the authentication guard already reloads the user from PostgreSQL on each HTTP request, a role/membership change can still happen *during* that request. The new transaction-scoped read/write guards ensure that privileged access does not cross that race window.

- `apps/api/src/assets.ts` — asset listing joins an active `users` row and evaluates `actor.role` in SQL rather than passing a request-time administrator boolean. The GET asset detail now calls `requireCurrentAssetRead` and selects the asset within the same tenant-scoped transaction. Asset creation now calls `requireCurrentOrganizationRole` within the write transaction, before INSERT and audit, with a PostgreSQL membership `FOR SHARE` lock.
- `apps/api/src/cases.ts` — case listings evaluate the current active role in the same tenant query. GET case details now call `requireCurrentCaseRead` and read the case in the same transaction. Confidential evidence listing uses that same transaction-scoped guard; removed a separate preflight transaction and duplicate `setTenantScope` calls.
- `apps/api/src/contexts/access/infrastructure/transactional-access.ts` — added `requireCurrentOrganizationRole` with a locked, active membership check for allowed roles. Existing v0.73/v0.74 permission helpers are retained.
- `tools/tests-v75/current-role-read-v75.test.cjs` — 24 source-level tests exercising actual transpiled service/guard code with injected PostgreSQL mocks: role demotion, suspension, owner/grant access, cross-request authorization order, single-transaction evidence retrieval, write ordering and audit suppression. Mocks do **not** establish actual PostgreSQL locking behavior.
- Registered `verify:v75` in root `package.json` and CI, advanced root/API/web package versions to `0.75.0`. No new SQL migrations.

## Verifications completed in this environment

| Gate | Outcome |
| --- | --- |
| New v0.75 tests | 24/24 pass |
| Historical/current scripts v0.41–v0.75 | 35/35 pass; 598 reported TAP pass cases |
| Architecture check | Pass (3/3 tests) |
| Syntax transpilation | Pass (108 TypeScript/TSX files, zero syntax diagnostics) |
| CI workflow policy | Pass |
| Limited source secret scan | Pass (3,441 files, zero high-confidence matches) |
| SQL migration comparison to v0.74 | 27/27 exactly unchanged |
| Reviewed RLS contract and migration planner | Both exactly unchanged |
| Source-only build artifact inspection | **BLOCKED**: authentic reviewed package-lock.json absent |
| Release preflight v0.51 | **BLOCKED**: authentic reviewed lockfile absent |
| Full API/web build | **FAILED**: Node types/NestJS and other genuine dependencies not installed |
| Live PostgreSQL, concurrency, browser and real authenticated HTTP | **NOT EXECUTED** |

Detailed version-suite logs are in `test-evidence/v75/version-suites/` and per-gate outcomes under `test-evidence/v75/checks/`. Reports do not claim production security. Run `V75_KALI_VALIDATION.md` on a trusted machine, retaining redacted evidence of the first failure.

## Remaining critical release work

1. Recover or generate the genuine reviewed npm lockfile **on a connected trusted machine**, validate package registry resolutions, `npm ci` and `npm audit`, then compile both API and web. Do not synthesize a lockfile offline.
2. Start only the isolated v0.70 **disposable** PostGIS/ClamAV environment; apply all migrations and use a restricted non-owner runtime role. Record `pg_policies`, RLS, audit and two-org CRUD tests with the actual PostgreSQL version.
3. Validate v0.75 reads/writes with two PostgreSQL connections while demoting/suspending a current org administrator: GET `/api/v1/assets`, GET `/api/v1/assets/:id`, POST `/api/v1/assets`, GET `/api/v1/cases`, GET `/api/v1/cases/:id`, GET `/api/v1/cases/:id/evidence`. Test current client/reviewer workflows as positives, cross-organization and revoked grants as negatives.
4. Audit the remaining application paths separately (case readiness, workflow approval, quote/payment, system administrator controls, reports, notifications). This milestone does not assert platform-wide authorization completeness.
5. Complete the independent FINAL SECURITY HARDENING AND RELEASE GATE: authentication/MFA, role isolation, server-authoritative payments, HTTPS/SSH restriction, safe uploads/ClamAV, CSRF and rate limits, dependency and **full original Git-history** secret audit/rotation, restore, rollback, regression and adversarial tests. Keep release NO-GO until evidence is signed off.

## Architecture and security invariants

Maintain DDD, TDD, SOLID and Clean Architecture. The new application boundary delegates database-specific permission checks to the infrastructure adapter. Transaction-local tenant context (`setTenantScope`) and immutable audit-write coupling remain mandatory. Do not weaken RLS or change migrations to make tests pass. Keep sensitive credentials out of handovers and archives.
