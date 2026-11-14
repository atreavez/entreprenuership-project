# AssetTrust v0.70 Test Evidence

**Date:** 12 November 2026  
**Scope:** offline source validation plus executable future Kali integration workflow; not live integration certification.

| Gate | Observed result | Supporting local evidence |
|---|---|---|
| New v0.70 integration provisioning tests | **PASS, 29/29** | `test-evidence/v70/regression/v70.log` |
| v0.41–v0.70 regression suites | **PASS, 30/30** | `test-evidence/v70/regression-matrix.json`, `regression/*.log` |
| Explicitly counted TAP tests across version suites | **482 passed** | 30-suite regression summary; not live tests |
| Architecture boundary checks | **PASS** | `test-evidence/v70/architecture.log` |
| TS/TSX source syntax/transpilation | **PASS** | `test-evidence/v70/syntax.log` |
| Local source entry/import verification | **PASS** | `test-evidence/v70/source-entry.log` |
| CI workflow policy | **PASS** | `test-evidence/v70/ci-workflow.log` |
| Limited current-source credential scan | **PASS: 0 high-confidence matches in 3,214 files** | `test-evidence/v70/source-scan.log` |
| Pinned SQL migration comparison | **PASS: 27/27 unchanged** | SHA-256 comparison against supplied v0.69 files |
| Tenant-isolation domain contract comparison | **PASS: unchanged** | SHA-256 comparison against supplied v0.69 files |
| New Compose YAML parsing | **PASS: valid YAML**, not engine execution | parsed with PyYAML locally |
| Read-only dependency/build inspector | **BLOCKED**, as expected | `test-evidence/v70/build-inspection.log` |
| CLI plan | **PASS, no side effects** | `test-evidence/v70/kali-plan.json` |
| CLI doctor | **BLOCKED** because local private credentials are intentionally absent | `test-evidence/v70/kali-doctor.json` |
| `npm ci`, genuine NestJS API and Vite builds | **NOT VERIFIED** | authentic lockfile/dependencies unavailable; npm registry not resolvable |
| Live local Docker/PostGIS and ClamAV | **NOT RUN** | Docker daemon/CLI unavailable in authoring environment |
| Real RLS/tenant CRUD and five HTTP suites | **NOT RUN** | requires the connected trusted Kali runtime and restricted database |
| Git-history credential scan, browser flows, backup/restore, HTTPS deployment | **NOT VERIFIED** | original Git history/services unavailable |

**Interpretation:** offline passing tests establish that the new *workflow implementation* behaves fail-closed against the included mocked process calls. They do not establish that `docker compose`, the PostGIS image, PostgreSQL roles, compiled NestJS API or browser workflows actually function on the user's Kali installation. The first real failure must be diagnosed before moving to later milestones. No gate has been skipped to produce a false green result.

**Release:** `NO-GO` until all original security-hardening and runtime acceptance requirements pass with genuine evidence.
