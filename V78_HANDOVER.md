# AssetTrust v0.78 — Engineering handover

**Date:** 12 November 2026  
**Base checkpoint:** AssetTrust v0.77 complete source.  
**Release verdict:** **NO-GO** — live dependency-backed compilation, PostgreSQL, HTTP/browser acceptance and final security approval remain outstanding.

## Actual engineering change

The legacy migration implementation in `tools/migrations/run.cjs` acquired a **blocking** PostgreSQL session advisory lock using `pg_advisory_lock(1642872011)`. If a migration process stalled or remained connected while holding the lock, an overlapping `db:check`, baseline or migrate invocation could wait indefinitely, with no clear error. The connection was also opened before its main cleanup guard; a connection failure did not follow the same cleanup path.

v0.78 replaces that with `pg_try_advisory_lock($1::bigint)` using a bound historical lock ID. If the lock is held, it rejects immediately **before reading or changing schema state**. A successful run releases the lock, checks the unlock result and closes its client. Error paths preserve the original SQL error where cleanup also fails, and explicitly report uncertain states after a failed rollback. A failed `COMMIT` never counts as a completed migration; operators must inspect the checksummed ledger before retrying. `--check` remains read-only. `--baseline` remains explicitly guarded; combining baseline and check now fails closed.

These changes do **not** modify any of the 27 existing SQL migration files or tenant-isolation policies. No database was contacted in this packaging environment.

## New executable acceptance

- `tools/e2e-pg-migration-lock-v78.mjs --plan`: read-only plan without packages or credentials.
- `ASSETTRUST_V78_PG_CONFIRM=YES ... node tools/e2e-pg-migration-lock-v78.mjs --run`: requires `CI=true`, `NODE_ENV=test`, mutation policy flag for the existing disposable target validator, explicit confirmation, and a loopback database named `assettrust_test` or `assettrust_ci`. The test itself makes no schema or business-data changes. It holds the lock in session A, ensures the actual runner in session B refuses without waiting, checks that the ledger did not change, unlocks, and runs a fresh full 27-file ledger check.
- `tools/kali-pg-migrations-v78.cjs`: guarded launcher using the existing private v0.70 local PostGIS credentials. Credentials and raw failed child output are not echoed.
- `.github/workflows/ci.yml`: v0.78 offline checks and real PG lock acceptance are mandatory after migrations have been applied and checked, before privileged-role provisioning.

The live test is **prepared but not executed here**; no real PostgreSQL acceptance claim is made.

## Verification actually completed

| Check | Result |
|---|---|
| New v0.78 tests | **30/30 PASS** |
| Historical version-script matrix v0.41–v0.78 | **38/38 PASS**, 695 total TAP passes |
| Old v0.11 migration policy suite | **10/10 PASS** after adapting its injected fake to the new lock query |
| TypeScript syntax check | **108 files transpiled**, zero syntax diagnostics; not a typecheck |
| Architecture suite | **3/3 PASS** |
| Source import preflight | **105 source files / 291 relative imports**, PASS |
| CI workflow syntax/coverage | **PASS**, 76 version scripts and 33 PG contract scripts |
| Source-only high-confidence secret scan | **PASS**, 3,526 files, zero matches |
| Full Git-history secret scan | **BLOCKED**: no `.git` history in distributed ZIP |
| Authentic `package-lock.json` | **ABSENT**; lockfile verification fails |
| Full NestJS/React build | **FAILED/BLOCKED**: missing node_modules, Node typings and external dependencies |
| Actual PostGIS/advisory-lock behavior | **NOT EXECUTED** |
| Actual authenticated API/browser tests | **NOT EXECUTED** |

The initial long regression run reached v0.72 before reaching its execution limit. v0.73–v0.78 were run individually; v0.75 initially rejected the new package version string and its version-only fixture was adjusted to include v0.78, without changing the permission assertions. All 38 final suite outputs report zero failures. No count above treats the offline test host as a live API test.

## Changed files

- `tools/migrations/run.cjs` — non-blocking advisory lock, reliable cleanup and error precedence.
- `tools/tests-v11/migration-policy.test.cjs` — historical fake PG response for the new lock contract.
- `tools/tests-v75/current-role-read-v75.test.cjs` — version-only compatibility with v0.78.
- `tools/tests-v78/*.test.cjs` — 30 new fault-injection and wrapper safety tests.
- `tools/e2e-pg-migration-lock-v78.mjs`, `tools/kali-pg-migrations-v78.cjs` — guarded live acceptance.
- Workspace manifests, CI policy, README, changelog, milestone handover, evidence and security report.

Unchanged: SQL migration contents, RLS policy contents, document cryptography, authenticated routes, payment calculations, asset/dispute behavior and platform/organization admin feature definitions.

## Hard release blockers

1. On a trusted connected Kali copy, recover or generate a genuine, reviewed `package-lock.json`; run `npm ci`, dependency audits and full backend/frontend compilation, and fix any newly revealed compiler errors.
2. Prepare a disposable PostGIS database and execute **both** v0.77 real dispute acceptance and v0.78 real migration-lock acceptance with the approved restricted roles.
3. Run the supervised HTTP, two-organization, administrator MFA, document revocation, financial-authority and browser acceptance suites. Verify upload scanning, production TLS, server-side secrets, RLS, backups and recovery.
4. Independently scan the full original Git history and rotate any compromised credentials. Complete the final adversarial, integration and deployment security release gate with evidence. Unresolved critical findings prohibit production release.

**Interpretation:** This v0.78 ZIP is a tested source-engineering checkpoint, not a built or production-approved application.
