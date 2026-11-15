# AssetTrust v0.76 — Test evidence

**Date:** 12 November 2026  
**Testing environment:** offline source harness; Node 22, global TypeScript; no genuine dependency installation and no PostgreSQL service.  
**Decision:** **NO-GO**.

## TDD regression result

- **RED (unmodified v0.75 source):** 33 new test cases executed, **8 passed / 25 failed**, exit 1. Recorded in `test-evidence/v76/logs/red-v75.log`.
- **GREEN (v0.76 implementation):** 33/33 tests passed, exit 0. Recorded in `test-evidence/v76/logs/verify-v76.log`.
- The test harness compiles and executes the actual `OperationsService` and current-role authorization adapter with injected database responses; it does **not** prove PostgreSQL transaction isolation or live HTTP behavior.

## Recorded regression matrix

- `npm run verify:v41` through `npm run verify:v76`: **36/36 individual scripts returned exit 0**.
- Explicit TAP `# pass` totals from those individual scripts: **631 cases**. This is a sum of local script successes, not 631 live functional workflows.
- Logs: `test-evidence/v76/version-suites/verify-v41.log` through `verify-v76.log`.
- Structured summary: `test-evidence/v76/version-matrix.json`.

## Other gates

| Gate | Result | Evidence |
|---|---|---|
| Architecture | PASS, 3/3 | `checks/architecture.log` |
| TS/TSX syntax transpilation | PASS, 108 files, 0 diagnostics | `checks/syntax.log` |
| CI workflow policy | PASS | `checks/ci-policy.log` |
| Source entry/import integrity | PASS | `checks/source-entry.log` |
| Limited current-source secret scan | PASS, 0 high-confidence matches/3,508 files | `checks/source-secret.log` |
| SQL migrations and RLS policy contract | UNCHANGED, 27/27 migrations | byte comparison to v0.75 |
| Authentic npm lockfile check | BLOCKED/FAILED, exit 1 | `checks/lockfile.log` |
| Read-only release preflight | BLOCKED/FAILED, exit 1 | `checks/release-preflight.log` |
| Full API + frontend compilation | FAILED due to missing installed dependencies | `checks/full-build.log` |
| Actual PostgreSQL/PostGIS and two-connection race | NOT RUN | no local service |
| ClamAV, browser/MFA and HTTPS deployment | NOT RUN | no live deployment |
| Original Git history credential scan | NOT RUN | archive omits `.git` history |

**Caveat:** Successful SQL assertion and mock tests are not certification of real transaction-lock behavior or full authentication/tenant isolation. The final security and release gate is mandatory.
