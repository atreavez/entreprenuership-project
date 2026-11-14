# AssetTrust v0.72 — Runtime Transaction Recovery and Version-Aware Build Acceptance

**Date:** 12 November 2026  
**Based on:** v0.71 supervised Kali checkpoint  
**Production verdict:** **NO-GO**

## Engineering changes (actual source code)

1. `apps/api/src/contexts/platform/domain/db-runtime-limits.ts` adds a framework-free, immutable runtime pool deadline contract: up to 12 connections, 5s connection timeout, 15s PostgreSQL statement deadline, 20s client query deadline, 3s lock wait and 30s idle-in-transaction timeout. `apps/api/src/database.ts` now uses that contract when constructing the live node-postgres Pool. These are operational limits, not changes to SQL migration timings.
2. `Database.transaction()` now preserves original operation errors and **discards** a pooled client if `BEGIN`, `COMMIT` or `ROLLBACK` fails such that transaction state is unsafe. A normal business-query error followed by successful `ROLLBACK` can safely reuse a client. This is exercised against the actual transpiled Database adapter with fault-injected fake PostgreSQL clients.
3. `tools/kali-acceptance-v71.cjs` now validates build evidence against the **current package version** rather than permanently expecting `0.71.0`. At v0.72+ it requires the seventh build evidence step, `current-milestone-regression`, to pass.
4. `tools/build-acceptance-v68.cjs` now **requires and executes** the current version's `verify:vXX` step for packages v0.72 or newer after the existing six supervised build gates. Missing current-milestone scripts fail in preflight; tampered manifests and missing/mismatched evidence remain blocked. Older historical version fixtures retain their six-step contract.
5. `tools/runtime-db-diagnostics-v72.cjs` provides read-only, secret-free operational inspection. The `kali:acceptance:*:v72` scripts are convenience aliases to the same guarded v0.71 supervisor (both v70 and v71 explicit permissions are still required for live work).
6. 21 new isolated tests in `tools/tests-v72/transaction-and-build-v72.test.cjs`. Legacy fake PostgreSQL test fixtures were taught to provide the new pure configuration import; their authorization and RLS assertions remain unchanged.

## Recorded verification in offline authoring environment

- v0.72 new tests: **21/21 PASSED**.
- Regression suites `verify:v41` through `verify:v72`: **32/32 passed**, from individual suite executions; the uninterrupted all-suite command was stopped by the environment limit after v65, then v66–v72 were separately rerun. All v41–v65 commands had returned success before interruption.
- Architecture, 108 TS/TSX syntax-transpilation preflight, Vite source-import graph, CI completeness, and GitHub Actions workflow policy: **PASSED**.
- Exact SQL migration inventory: **27/27 unchanged** (no new migration). Existing RLS/tenant policy logic and admin authorization unchanged.
- Limited current-source secret scan: **PASSED**, 3,281 scanned files and no high-confidence matches. **NOT a Git-history credential scan**.
- `npm run build`: **FAILED / BLOCKED** on absent `@types/node`, NestJS, PostgreSQL and other installed packages. The source ZIP intentionally has no manufactured `package-lock.json`.
- Real Docker/PostGIS/ClamAV/compiled authenticated HTTP workflows: **NOT RUN**; original `.git` history absent, so original Git-history scan **NOT RUN**.
- Production approval: **NO-GO**. A passing fake-PG transaction test does not prove live PostgreSQL operational behavior.

## Correct next action

On trusted connected Kali, follow `V72_KALI_VALIDATION.md`. Restore the genuine reviewed lockfile or generate it only once (if genuinely missing). Install dependencies, run v0.72 supervised build, use a separate disposable loopback PostGIS/ClamAV fixture, then execute the signed-off v0.72 Kali supervisor. Examine its private first-failure evidence (the schema and filename may say v71, but `version` must be `0.72.0`). Investigate real compile/runtime errors, do not overwrite an existing disposable PostgreSQL volume, and do not try the process against production.

The final cross-project security gate remains mandatory: secure authentication, MFA for privileged actions, tenant isolation, server-authoritative pricing/payments, upload scanning, network hardening, credential review, live adversarial tests, restore and rollback, original Git history scans and independent signoff. Keep DDD, TDD, SOLID, Clean Architecture and security-by-design.
