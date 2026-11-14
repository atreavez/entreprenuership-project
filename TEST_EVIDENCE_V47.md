# AssetTrust v0.47 - Test Evidence and Release Decision

**Date:** 11 November 2026  
**Decision:** **NO-GO**, offline-tested source checkpoint only.

| Verification | Executed result |
|---|---|
| New v0.47 deterministic tests | **10/10 PASS** (see `test-evidence/v47/verify-v47.log`) |
| v0.03-v0.47 versions | **45/45 PASS**, see `test-evidence/v47/matrix.json` and per-version logs |
| CI static completeness | **PASS**, 45 versions + 21 PostgreSQL test scripts declared |
| Architecture guard | **PASS** (`architecture.log`) |
| Syntax-only TS/TSX | **PASS**, 102 files, zero diagnostics (`syntax.log`) |
| SQL migration fingerprint manifest | **22/22 MATCH** (no prior migration rewritten) |
| Source snapshot secret scan | **PASS** (1,796 files; no high-confidence matches); no Git-history scan |
| Unsafe PostgreSQL test target | **REFUSED** prior to connection (guard test) |
| v0.47 real PostgreSQL FK contract | **NOT EXECUTED**, PostgreSQL and project dependencies unavailable |
| `npm run build` | **FAILED/BLOCKED**, installed dependencies missing |
| `npm test` | **FAILED/BLOCKED**, installed dependencies missing |
| Read-only release preflight | **BLOCKED**, 3/11 prerequisites present |

## Scope of new tests

Migration atomicity, absence of unsafe bypasses, ten cross-tenant 2-column FK relationships, one three-column document/case/asset constraint, four composite reference unique keys, exact SHA-256 mapping, old RLS retention, CI wiring, disposable DB guard and read-only 11-relationship audit.

## Important limitations

Passing source-level checks does **not** show that any foreign-key constraints have actually executed in PostgreSQL. No runtime, DB migration, end-to-end user login, tenant isolation, payment, file malware check, browser test, HTTPS/SSH inspection, full dependency vulnerability audit, restore drill or pen test has been proven by this checkpoint. The original `.git` history was not available in this archive; historic secrets cannot be ruled out.

Retain all logs and an approved backup/restore record before any future deployment decision. No production go-live approval is implied by this document.
