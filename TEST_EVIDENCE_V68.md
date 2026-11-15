# AssetTrust v0.68 — Test and Build Evidence

**Date:** 12 November 2026  
**Scope:** Offline code, source integrity, unit tests, regression tests, CI YAML, and release-preflight status. No real deployed application testing.

| Check | Recorded result | Location |
|---|---|---|
| New v0.68 acceptance tests | **25/25 passed** | `tools/tests-v68/`; `test-evidence/v68/regression/v68.log` (earlier 23-test run), current CLI rerun 25/25 |
| Version-suite regression v0.41–v0.68 | **28/28 suite commands passed** | `test-evidence/v68/regression/v41.log` through `v68.log` (v68 later rerun for 25-test final) |
| Architecture policy | **Passed** | `test-evidence/v68/regression/verify-architecture.log` |
| TS/TSX source transpilation | **Passed** | `test-evidence/v68/regression/verify-syntax.log` |
| Vite source entrypoint/relative import scan | **Passed** | `test-evidence/v68/regression/build-source-v56.log` |
| CI YAML/release workflow verification | **Passed** | `test-evidence/v68/regression/verify-ci-v53.log` |
| SQL migrations | **27/27 unchanged from v0.67**, SHA match verified | Byte comparison of v0.67 source archive and v0.68 tree; current read-only diagnostic |
| Limited current-source credential scanner | **Passed: 0 high-confidence matches / 3,073 files** | `test-evidence/v68/blocked/security-scan-v43.log` |
| Real lockfile validation | **Blocked**: no genuine lockfile | `test-evidence/v68/blocked/lockfile-check-v55.log` |
| Full `npm run build` | **Failed / dependency-blocked** | `test-evidence/v68/blocked/build.log` |
| Official read-only release preflight | **Blocked**: authentic lockfile absent | `test-evidence/v68/blocked/release-preflight-v51.log` |
| Npm registry connectivity | **Failed**: `EAI_AGAIN` | Terminal `npm ping` on the offline host |
| Live PostgreSQL/PostGIS and two-API acceptance | **Not run** | Required connected Kali disposable environment |

The v0.68 tests use fake subprocess runners and sandbox temporary files solely to prove fail-closed gate behavior. They **do not** represent an actual `npm ci` or successful compilation of the system.

`npm run build` was attempted with a global TypeScript executable but missing installed `@nestjs/*`, `pg`, and `@types/node` modules. Re-test after authentic dependency installation on Kali; do not assert a source defect based only on missing package diagnostics.

**Release verdict: NO-GO.** No claimed full build, live database isolation proof, deployed security certification, Git-history scan, ClamAV verification, or browser acceptance.
