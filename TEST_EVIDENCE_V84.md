# AssetTrust v0.84 — Test Evidence

**Date:** 12 November 2026. **Scope:** source plus isolated, mocked service behavior only. **Decision:** offline development pass; production NO-GO.

| Verification | Measured result | Evidence |
|---|---|---|
| New v0.84 actual-service offline tests | 28 passed / 0 failed | `test-evidence/v84/v84.log` |
| All version suites v0.41–v0.84 | 44 passed / 0 failed, **872** counted passing cases | `test-evidence/v84/v41.log` through `v84.log` |
| Targeted older authentication tests | v18, v20, v27, v82, v83 passed | Tests rerun after fixture corrections |
| Source syntax | 109 TS/TSX files transpile; 0 syntax diagnostics | `test-evidence/v84/checks/verify-syntax.log` |
| Architecture | PASS | `test-evidence/v84/checks/verify-architecture.log` |
| CI suite and workflow policy | PASS; 82 version suites, 33 PostgreSQL contract declarations | `test-evidence/v84/checks/verify-ci-v41.log`, `verify-ci-v53.log` |
| Source-import declarations | PASS | `test-evidence/v84/checks/build-imports-v80.log` |
| Snapshot source-secret scan | PASS; zero high-confidence pattern findings (limited coverage) | `test-evidence/v84/checks/security-scan-v43.log` |
| Migrations | 27 unchanged vs v0.83 archive | Byte-for-byte Python comparison |
| Authentic lockfile check | FAIL (expected blocker: no genuine `package-lock.json`) | `test-evidence/v84/checks/lockfile-check-v55.log` |
| Full npm build | FAIL (uninstalled packages / NestJS and Node declarations unavailable) | `test-evidence/v84/checks/build.log` |
| npm audit, live PostgreSQL, HTTP/browser, original Git history | NOT RUN | Requires connected trusted Kali and original repository |

The 28 new tests execute transpiled **real** `AuthenticationService` methods using a controlled transactional adapter. The adapter simulates PostgreSQL effects; it does not prove real lock conflicts, wire-level session ordering, statement timeouts or real RLS enforcement.

**Security posture:** no assertion of production security, complete build or live acceptance. Passing sources and offline fixtures are insufficient for launch. See `ASSETTRUST_V84_SECURITY_REPORT.md`.
