# AssetTrust v0.62 — Reproducible offline test evidence

**Date:** 11 November 2026. **Verdict: OFFLINE SOURCE CHECKPOINT COMPLETE; PRODUCTION NO-GO.**

## Measured passing checks

| Check | Recorded result | Scope |
| --- | --- | --- |
| `npm run verify:v62` | **18 / 18 tests passed** | Migration policies, 12 composite FKs, same-org recipient privacy, scoped service operations, server startup inventory, CI/runner safety, live-test guard, preflight probe coverage |
| `npm run verify:v03` through `verify:v62` | **60 / 60 suites passed** | Full historical matrix stored as `test-evidence/v62/version-matrix.json` plus one log per suite; final manifest-inventory edit was additionally checked with `verify:v11` and `verify:v62` |
| `npm run verify:ci:v41` | PASS | All declared offline and PostgreSQL suites covered in CI YAML (60 offline versions; 30 PG contracts) |
| `npm run verify:ci:v53` | PASS | GitHub Actions YAML syntax and security contract |
| `npm run verify:architecture` | PASS | DDD/Clean Architecture boundary tests |
| `npm run verify:syntax` | PASS | 104 TS/TSX source files transpile; **not** a full compiled build |
| `npm run build:source:v56` | PASS | Source entrypoints and relative import graph; **not** a runtime build |
| `npm run smoke:offline` | PASS | Pure domain smoke checks |
| Migration checksum manifest | **27 / 27 SHA-256 hashes matched** | `apps/api/sql/001`–`027`; original `001`–`026` unchanged |
| Source snapshot credential scanner | PASS | No high-confidence matches; *not* a complete Git-history or independent secret audit |

The v0.62 tests include both static source assertions and executable mock service tests. They do **not** establish real PostgreSQL enforcement or browser functionality.

## Blocked / unexecuted checks

| Check | Actual result | Explanation |
| --- | --- | --- |
| `npm run release:preflight:v41` | **BLOCKED; 3 / 11 prerequisites present** | No lockfile, installed dependency graph, build outputs or deployment runtime configuration |
| `npm ci --offline --ignore-scripts` | **FAILED** | No genuine `package-lock.json` |
| `npm run build` | **FAILED** | Missing installed NestJS/Node/TypeScript package dependencies; not a successful compilation |
| `npm run test:pg:operational-rls:v62` | **NOT RUN LIVE** | No disposable live PostgreSQL service + distinct operator/restricted credentials in this environment; unsafe invocation correctly blocks before `pg` import |
| Full HTTP/browser tests | NOT RUN | Need compiled API/web, database, authenticated users and explicit test markers |
| ClamAV clean/malware verdict | NOT RUN LIVE | No ClamAV scanner service present |
| Git history scan on canonical clone | NOT RUN | The checkpoint ZIP does not contain original `.git` history |
| Production TLS/restore/penetration tests | NOT RUN | No deployed environment or external review |

## Security properties intended for live proof

The new SQL migration enables `FORCE RLS` on tasks, disputes, reminders, quotes and notifications. App notifications list/mark-read pass both an organization and recipient ID inside one transaction. Notification `INSERT` remains organization-scoped to support system-generated messages; direct `DELETE` has no RLS policy. Twelve organization-matched foreign keys reject cross-org parent references. The live test prepares two organizations, two recipients in one organization, cross-link probes and transaction reset assertions, but **has not returned a live pass**.

## Critical operating instructions

Run `tools/sql/v62-operational-preflight.sql` in read-only mode on a restore-tested staging copy before migration 027. If any of the twelve counts is nonzero, STOP and investigate. Migration 027 may break an older API's unscoped notification reads; use a coordinated compatible API/schema rollout and do not attempt production deployment from this checkpoint.
