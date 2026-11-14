# AssetTrust v0.73 — Test Evidence and Known Blockers

**Date:** 12 November 2026  
**Scope:** local/offline authoring environment, without installed NestJS, Docker or PostgreSQL. No live deployment certification.

## Passed

| Gate | Result | Evidence |
|---|---|---|
| New direct v73 tests | 31/31 PASSED | `npm run verify:v73`; `test-evidence/v73/version-suites/v73.log` |
| Historical/current suites v41–v73 | 33/33 PASSED | 33 individual `.log` files and `.json` statuses, `test-evidence/v73/regression-matrix.json` |
| Counted TAP cases in those suites | 555 PASSED, 0 failed | `regression-matrix.json` |
| Architecture and TS/TSX transpilation preflight | PASSED | `npm run verify:architecture` and `npm run verify:syntax` |
| CI completeness | PASSED | `npm run verify:ci:v41` |
| Source SQL migrations | 27/27 UNCHANGED | Compared every archived v0.72 SQL file against v0.73 sources |
| Limited current-source credential scanner | PASSED | `npm run security:scan:v43`; 3,349 scanned, 0 high-confidence detections |
| Guarded live suite without authorization | BLOCKED as intended | `npm run test:e2e:documents:v73` refuses missing explicit consent |

New tests exercise actual TypeScript-transpiled `DocumentsService` and `transactional-access.ts` with synthetic in-memory dependencies, plus fake HTTP transport over the guarded v73 acceptance journey. They include revoked asset access, suspended actor, changed administrator role, confidential case restrictions, encrypted blob digest mismatch, legacy format denial, and failed revocation controls. These tests are **not** a substitute for real PostgreSQL concurrency/locking evidence.

## Blocked / not run

| Gate | State | Cause |
|---|---|---|
| `npm run release:preflight:v51` | BLOCKED | Missing genuine, reviewed `package-lock.json` |
| `npm run build` | FAILED / BLOCKED | NestJS/Node and other development/runtime packages not installed; offline registry lookup failed |
| Production npm audit | NOT RUN | No authentic dependency resolution or lockfile |
| Docker PostGIS/ClamAV and live HTTP v73 revocation | NOT RUN | No Docker daemon, PostgreSQL service or compiled API available in authoring environment |
| Full Git history secret scan | NOT RUN | Original repository `.git` history absent in checkpoint |
| Concurrency attack/physical database locks | NOT RUN | PostgreSQL service absent |
| Browser, payment, backup/restore and deployment | NOT RUN | External staging services absent |

**Verdict: NO-GO.** Complete `V73_KALI_VALIDATION.md` on an authorized connected Kali development machine and preserve private, redacted first-failure evidence. Do not deploy to production on the strength of source-only tests.
