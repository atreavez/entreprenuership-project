# AssetTrust v0.40 — Evidence and release verdict

**Date:** 11 November 2026. **Scope:** Shared failed-recipient-credential attempt limits, tenant warning UI and release preflight. Tests performed in a local Linux container using Node 22.16.0 and global TypeScript. The container had no installed project dependencies, project lockfile, PostgreSQL or npm registry DNS access.

## Observed outcomes

| Test gate | Recorded result | Source evidence |
| --- | --- | --- |
| v0.40 focused TDD domain/service/migration/preflight tests | **11/11 PASS** | `test-evidence/v40/verify-v40.log` |
| Version-check commands v0.03 through v0.40 | **38/38 PASS** | `test-evidence/v40/verify-v03.log` through `verify-v40.log`, `version-matrix.tsv` |
| Architecture checks | **PASS** | `test-evidence/v40/verify-architecture.log` |
| TS/TSX syntax scan | **92 files, zero syntax errors** | `test-evidence/v40/verify-syntax.log` |
| Forward-only migration 018 in source plan/manifest | **PASS** (18 matching SHA-256 fingerprints) | Source assertions and `tools/migrations/plan.cjs` |
| Guarded live PostgreSQL contract test | **AUTHORED, NOT RUN** | `tools/e2e-pg-recipient-attempts-v40.mjs` (`node --check` passed) |
| Read-only release preflight | **BLOCKED by missing prerequisites, correctly fail-closed** | `test-evidence/v40/release-preflight.log` |
| `npm ci --offline --ignore-scripts --dry-run` | **FAILED (missing package-lock.json)** | `test-evidence/v40/npm-ci-offline.log` |

## TDD details

The first v0.40 test run failed as expected (4 of 8 focused tests) when the policy module, migration, query mocks and warnings were absent. `test-evidence/v40/RED_initial.log` records this RED phase. Following implementation, 8/8 original new tests passed, and three additional tests strengthened the coverage around transactional rollback, valid access below the threshold and conservative release preflight (final total **11/11 GREEN**).

The existing v0.39 mock loader initially failed to recognize new queries; its fixture was revised without changing the v0.39 production checks. All nine existing v0.39 tests now pass. A test double simulates counter rollback on exceptions; this is still **not** proof of real transaction behavior.

## Known production blockers

1. **No authentic npm lockfile, no clean dependency installation or full API/Vite build.** Registry DNS was inaccessible in this environment. Do not fabricate lockfiles.
2. **No applied PostgreSQL migration 018** and no live FK/trigger/locking test. The runner is safe by policy but cannot execute without an explicit disposable database and drivers.
3. **No two-node shared counter concurrency test**, authenticated two-admin browser walkthrough, real download/receipt verification or network security test.
4. **No proven deployment of HTTPS, shared edge controls, central security monitoring, key custody, restore drills, penetration testing, land-registry integrations or legal/data-protection approvals.**
5. A known share ID can be deliberately blocked for up to 15 minutes through invalid attempts. This tradeoff must be reviewed before handling customer data.

## Decision

**OFFLINE-TESTED DEVELOPMENT CHECKPOINT. NOT PRODUCTION READY.** Syntax tests are not type checking; mocked tests are not live database or browser tests. Signatures certify bytes, not legal title or the underlying truth of an evidence record.
