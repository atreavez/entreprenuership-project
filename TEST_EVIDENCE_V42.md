# AssetTrust v0.42 — Test evidence and release decision

**Checkpoint:** 11 November 2026. **Decision:** NOT PRODUCTION READY.

| Gate | Observed result | Evidence |
|---|---|---|
| v0.42 test-first stage | **RED**: test required a module that did not yet exist | `test-evidence/v42/red-initial.log` |
| New v0.42 pure/policy/security tests | **PASS**, 8/8 after implementation | `test-evidence/v42/verify-v42.log` |
| Historical and new version suites | **PASS**, 40/40 (`verify:v03`–`verify:v42`) | `test-evidence/v42/verify-vNN.log`, `regression-results.json` |
| Static CI suite completeness | **PASS**: all 40 version suites, 17 PostgreSQL contract scripts and two-server integration gate referenced | `test-evidence/v42/verify-ci.log` |
| Architecture checks | **PASS** | `test-evidence/v42/verify-architecture.log` |
| TypeScript/TSX syntax scan | **PASS**, 92 source files, 0 syntax diagnostics — **not a full TypeScript build** | `test-evidence/v42/verify-syntax.log` |
| Node syntax checks | **PASS** for new policy, supervisor and test files | Source check output |
| SQL migration fingerprints | **PASS**, all 18 unchanged SQL files match pinned SHA-256 manifest | Local SHA-256 comparison |
| CI YAML | **PASS** parse; one integration job | PyYAML parser |
| Read-only release prerequisite check | **BLOCKED**, 3/11 preconditions present | `test-evidence/v42/release-prerequisites.json` |
| Clean offline `npm ci` | **FAILED**: no authentic lockfile | `test-evidence/v42/npm-ci-offline.log` |
| Full API/web build | **FAILED** due to missing dependencies/types | `test-evidence/v42/full-build.log` |
| Two real API processes / live PostgreSQL | **NOT EXECUTED** (no local PostGIS, pg packages or compiled API) | Runner refusal without authorization: `test-evidence/v42/two-api-guard-no-consent.log` |
| Guarded validation shell | **PASS** refusal against unauthorized target; no mutation | `test-evidence/v42/run-disposable-no-consent.log` |
| Authenticated browser, valid-share two-server race, deployment | **NOT EXECUTED** | External environment still required |

**Important limitation:** `npm run verify:v42` validates policies and supervisor source, not actual child processes. The runtime two-API smoke tests **only readiness and rejection of nonexistent shares** if executed; it cannot prove valid-share simultaneous redemption consistency or shared credential lockout across nodes. No production safety claim should be derived from offline passing tests.

**Remaining release gates:** genuine reviewed lockfile, `npm ci`, full API and Vite builds, disposable PostgreSQL migrations + contract execution, owned two-server smoke, valid-share concurrency, authenticated Playwright flows, TLS/proxy protection, restore drills, signing-key custody, professional verification and applicable Uganda privacy/legal review. Do not onboard real customer evidence until those gates have retained, independently reviewed evidence.
