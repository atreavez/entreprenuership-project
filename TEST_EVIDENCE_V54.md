# AssetTrust v0.54 - Executed security test evidence

**Assessment:** 11 November 2026. **Approval: NO-GO**. This document records executed checks and unresolved release gates, not a deployment certificate.

| Check | Observed result |
| --- | --- |
| v0.54 Git-history tests (actual disposable Git repositories) | **15/15 PASS** |
| Historical/current version scripts `verify:v03`-`verify:v54` | **52/52 PASS** |
| CI completeness v0.41 / real YAML policy v0.53 | **PASS / PASS** (52 version suites, 24 PostgreSQL contracts wired) |
| Architecture / TS/TSX syntax / offline smoke | **PASS / PASS / PASS** |
| SQL migration bytes vs v0.53 source | **25/25 IDENTICAL**; none added |
| Snapshot high-confidence secret scan | **PASS**, 2,234 inspected files at the recorded checkpoint |
| v0.54 full-history scanner on source ZIP | **BLOCKED AS DESIGNED**: no `.git` directory |
| Supervised release plan | **89 planned stages** (61 build/security + 28 PostgreSQL/HTTP) |
| Original AssetTrust Git-history scan | **NOT RUN**: original clone not mounted here |
| `npm ci --offline` | **FAILED/BLOCKED**: genuine lockfile missing |
| `npm run build`, `npm test` | **FAILED/BLOCKED**: installed dependencies absent |
| Real ClamAV scanner | **FAILED/BLOCKED**: daemon/socket unavailable |
| PostgreSQL and two-API tests | **NOT RUN**: no disposable PostgreSQL service and dependencies |
| `release:preflight:v41` | **BLOCKED**, 3/11 prerequisites present |
| HTTPS/SSH, live browser, restore drill, third-party pentest | **NOT RUN** |

## What v0.54's 15 tests established

A real local Git repository was initialized for each test. Coverage includes benign histories; leaked test credentials in files deleted from the working tree; locally reflog-retained reset commits; commit-message tokens; historical sensitive filenames; oversized blob warnings; shallow clones and missing `.git`; scan budgets; bulk 120-file batch handling; targeting an external original repository via `--repo`; non-disclosure of test token values; strict CLI parsing; required CI commands; and rejection of CI omission.

Tests do not prove that actual credentials were never leaked. The scanner only recognizes a subset of credential formats and cannot inspect unavailable Git objects or external credential stores. Its own failure on the source ZIP is intentional and mandatory.

## Traceability

Version command logs: `test-evidence/v54/vNN.log`. Additional logs: `verify-architecture.log`, `verify-syntax.log`, `verify-ci-v41.log`, `verify-ci-v53.log`, `smoke.log`, `snapshot-scan.log`, `history-scan-blocked.log`, `npm-ci-offline.log`, `npm-build.log`, `npm-test.log`, `clamav-live.log`, `release-preflight-v41.log`, `release-preflight.log`, `release-full-clamav.log`, and `evidence-review.log`. Migration fingerprints: `migration-fingerprints.json`.

Do not count tests that are blocked, skipped, source-only or unexecuted as passed. No keys were rotated and no live secrets were printed.

**Final security decision: NO-GO for commercial production.**
