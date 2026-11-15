# AssetTrust v0.74 — Test evidence

**Date:** 12 November 2026  
**Evidence type:** offline source-level tests and scripted validation. Not a live application certification.

| Gate | Outcome | Evidence |
|---|---|---|
| New current-role authorization suite | **19/19 PASS** | `test-evidence/v74/version-suites/v74.log` |
| v0.73 transactional-document suite | **31/31 PASS** | `test-evidence/v74/version-suites/v73.log` |
| Version suites v0.41–v0.74 | **34/34 PASS**, 574 counted TAP passes | `test-evidence/v74/regression-matrix.json`, `version-suites/*.log` |
| Framework/domain architecture | PASS | `test-evidence/v74/logs/verify-architecture.log` |
| TS/TSX syntax transpile | PASS, 108 source files | `test-evidence/v74/logs/verify-syntax.log` |
| CI workflow coverage | PASS | `test-evidence/v74/logs/verify-ci-v53.log` |
| Static build/source preflight | PASS | `test-evidence/v74/logs/build-source-v56.log` |
| Limited high-confidence secret snapshot scan | PASS, 3,399 inspected files, 0 matches | `test-evidence/v74/logs/security-snapshot-v43.log` |
| Full Git history secret scan | BLOCKED, archive has no original `.git` | `test-evidence/v74/logs/security-scan-v54.log` |
| Release preflight | BLOCKED, no authentic `package-lock.json` | `test-evidence/v74/logs/release-preflight-v51.log` |
| Full application compile | FAILED/BLOCKED, missing installed NestJS/Node definitions | `test-evidence/v74/logs/build.log` |
| Live PostgreSQL role-lock / concurrency tests | **NOT EXECUTED** | No connected DB or Docker available |
| Live authenticated HTTP and browser workflows | **NOT EXECUTED** | Must run on Kali |

**Test scope:** The new suite runs actual transpiled service/controller/permission-checking modules with simulated PostgreSQL responses. It validates ordering and refusal of stale administrator claims; simulated PostgreSQL is not evidence of real row-lock behavior. The v49 regression test was adapted to assert a stronger tenant-scoped transaction plus current-role check; the v73 fake HTTP test now binds to the current package version. Neither change disables negative tests.

**Database integrity:** Existing 27 SQL migration files and `pg_policies` integrity contract are unchanged from v0.73.

**Release decision: NO-GO.** An independent assessment, real PostgreSQL functional testing, dependency audit, Git history secret scan, browser tests and production deployment controls remain mandatory.
