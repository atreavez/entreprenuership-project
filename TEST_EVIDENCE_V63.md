# AssetTrust v0.63 - Test evidence and release-blocker record

**Date:** 11 November 2026  
**Checkpoint:** `0.63.0`  
**Scope:** Offline source/unit/release-policy verification only; not a production certification.

## Passed checks

| Gate | Result | Evidence location |
|---|---|---|
| New v0.63 security suite | **31/31 pass** | `test-evidence/v63/version-suites/v63.log` |
| Historical and current version suite matrix | **61/61 pass** (`v03`-`v63`) | `test-evidence/v63/version-suites/` and `version-matrix.json` |
| Database policy startup behavior in simulated Pool | **Pass** (valid inventory accepted; unexpected or weakened policies rejected) | `v63.log` |
| CI YAML / dependency-order policy | **Pass** | `test-evidence/v63/logs/ci-workflow.log` |
| Architecture boundaries | **Pass** | `test-evidence/v63/logs/architecture.log` |
| TS/TSX syntax transpilation | **Pass** | `test-evidence/v63/logs/syntax.log` |
| Vite source entry and import preflight | **Pass** | `test-evidence/v63/logs/source-entry.log` |
| Pinned SQL migrations | **27/27 unchanged** relative to v0.62 | Repository SQL and `tools/migrations/plan.cjs` |
| Limited current-source credential scanner | **Pass**, 0 high-confidence matches in 2,939 source files | `test-evidence/v63/logs/secret-source.log` |

**Regression method:** Each version script was invoked separately through `npm run verify:vXX`, stdout and stderr captured in the included files, and any transient/compatibility failures were corrected and the affected version was re-run. The final recorded runs for all 61 scripts returned zero. These are distinct scripts; this does not assert that all application integration tests passed.

## Blocked, not passing

| Gate | Recorded result | Cause |
|---|---|---|
| Read-only release preflight | **BLOCKED**, 3/11 | Lockfile, dependencies, build artifacts, runtime env, live evidence absent |
| `npm ci --offline --ignore-scripts --no-audit` | **FAILED/BLOCKED** | No authentic package-lock.json |
| `npm run build` | **FAILED** | Missing installed Node/TS definitions and NestJS/backend dependencies |
| `npm run test:pg:policy-contract:v63` | **BLOCKED** | No approved local disposable PostgreSQL environment and restricted login |
| Two-organization CRUD and notification isolation | **NOT RUN LIVE** | PostgreSQL and installed app dependencies unavailable |
| ClamAV, real HTTP/dual API, browser, restore and TLS | **NOT RUN LIVE** | External connected services and deployment not available |
| Original Git-history secret scan | **NOT VERIFIED** | The checkpoint archive has no original `.git` history |

The pure v0.63 policy-inventory checker intentionally rejects missing or additional policies. This is useful startup defense in depth but does not replace seeded, authenticated negative tests with a real PostgreSQL backend. It is not a mathematical proof of the absence of SQL injection, a substitute for admin privilege review or a complete independent security audit.

**Production release decision: NO-GO.** Preserve these logs when handing the source to an engineer, and complete `V63_KALI_VALIDATION.md` on the trusted Kali machine.
