# AssetTrust v0.53 — test evidence

**Date:** 11 November 2026  
**Artifact:** Source-only v0.53 checkpoint; no full runtime dependencies or Git history bundled.  
**Approval:** NOT production-approved.

| Executed check | Result | Important qualification |
|---|---|---|
| New v0.53 offline tests | **18/18 PASS** | Real Ruby YAML parsing, deliberate invalid configuration tests, evidence gate adversarial fixtures |
| All declared `verify:v03` through `verify:v53` | **51/51 PASS** | Source/unit/static version checks; interrupted batches were rerun and their completed logs retained |
| `verify:ci:v41` and `verify:ci:v53` | PASS | Static coverage plus actual Ruby/Psych YAML syntax/semantic validation; no GitHub Actions job run |
| Python PyYAML workflow parse | PASS | An additional independent local parser accepted the repaired YAML |
| Architecture and TypeScript/TSX syntax | PASS | 104 source files transpile without diagnostics; not a TypeScript typecheck or runtime build |
| `smoke:offline` | PASS | No real API/PostgreSQL environment |
| SQL migration SHA-256 manifest | **25/25 PASS** | Files checked locally; no migration executed |
| Snapshot high-confidence secret scan | PASS, 2,158 files | Limited patterns, no Git history scanned |
| `evidence:review:v53` | **BLOCKED (expected)** | 0/88 live steps reported; no original `.git` or authentic lockfile |
| v0.51 read-only release preflight | **BLOCKED** | Missing lockfile, installed modules, build outputs, and runtime env |
| `npm ci --offline` | **FAILED/BLOCKED** | No authentic package-lock.json; never fabricate one |
| `npm run build` | **FAILED/BLOCKED** | Missing NestJS and `@types/node` dependencies |
| `security:clamav:v52` | **FAILED/BLOCKED** | Real scanner not accessible; simulated scanner unit tests pass but do not prove detection |
| `release:full:v51` | **BLOCKED (expected)** | No mutation consent; no authentic lockfile; zero tasks spawned |
| Real PostgreSQL tests and two-server/browser E2E | **NOT RUN** | Requires owned Kali test environment, credentials and disposable local PostGIS DB |
| TLS/SSH/network, backup restore, penetration tests | **NOT RUN** | Must be verified on actual deployment environment |

Every version-command log is retained under `test-evidence/v53/verify-vNN.log`. CI/architecture/syntax, source-scan, preflight and failure logs are in the same folder. Tests failing because live services or dependencies are unavailable were NOT counted as passing tests.

**Release verdict: NO-GO.** Offline correctness and pipeline validity do not establish data protection in a deployed system.
