# v0.25 Test Evidence — release gate blocked

**Date:** 2026-11-10. **Compiled by Aturinzire Hargreave.**

## Test-first development

A v0.24-derived working tree was copied before implementation. The initial 12 v0.25 tests failed against the v0.24 code because new authoritative authorization adapters and transaction contracts did not yet exist (`test-evidence/v25/red.txt`). After implementing them and extending the tests to exercise actual service and application methods, **21/21 new tests passed**, including isolated strict TypeScript validation (`test-evidence/v25/verify-v25.log`).

Coverage includes tenant membership changes, token role downgrades, revoked and expired professional credentials, stage-qualified assignees, locked current authorization, and commit/abort behavior for the assignment service. A valid, currently authorized legal reviewer and administrator also continue through their respective workflows in tests.

## Final offline regression commands

26 of 26 verification commands returned zero. See `test-evidence/v25/regressions-final.tsv` and the per-command log files for details. This includes older policy/identity/document/mapping/migration/architecture checks and the current suite. Syntax verification transpiled **58 TS/TSX files** with no syntax diagnostics; this is **not a full build**.

## Separate release checks

| Gate | Actual result |
|---|---|
| Full `npm run build` | FAIL: dependencies absent, NestJS and other modules unresolved; see `full-build-attempt.txt` |
| Lockfile release gate | FAIL: authentic `package-lock.json` absent; see `release-gate.txt` |
| Offline lockfile installation attempt | FAIL: ENOTCACHED for @nestjs/common; see `npm-lockfile-offline-attempt.txt` |
| Live PostgreSQL test | NOT RUN: no database and `pg` dependency in this environment |
| PostgreSQL safety guard without explicit authorization | Expected refusal; see `disposable-db-guard.txt` |
| Live API/browser tests | NOT RUN |
| Production deployment | NOT APPROVED |

CI workflow updated to include `npm run verify:v25` and `npm run test:pg:workflow:v25` in its disposable PostGIS stage, but GitHub Actions was not executed from here. No user/customer data was accessed or changed.
