# AssetTrust v0.83 — Test Evidence

**Run context:** Authoring container, 12 November 2026. These logs are offline source tests and fault-injection mocks unless otherwise stated. They are not evidence of live PostgreSQL, HTTP or browser tests.

| Check | Observed result |
|---|---|
| `npm run verify:v83` | **PASS: 29/29** |
| v0.83 tests against v0.82 source (RED baseline) | **FAIL: 24/29**, as expected for new requirements and changed mocks |
| v0.83 tests against v0.83 source (GREEN) | **PASS: 29/29** |
| `npm run verify:v41` through `npm run verify:v83` | **PASS: 43/43**, **844** total cases; zero failures |
| Targeted earlier auth/security suites v05, v18, v19, v20, v27, v29, v30, v37, v44, v45 | **PASS** |
| `npm run verify:architecture` | **PASS** |
| `npm run verify:syntax` | **PASS: 109 TS/TSX source files transpile**, not a complete typecheck |
| `npm run build:imports:v80` | **PASS** |
| `npm run verify:ci:v53` | **PASS** |
| `npm run build:source:v56` | **PASS** (static source preflight) |
| Compare 27 SQL migration SHA-256 digests to v0.82 | **PASS: 27 unchanged** |
| Limited current-source secret scan | **PASS: zero high-confidence matches at 3,683 scanned files**; excludes original Git history |
| `npm run lockfile:check:v55` | **BLOCKED: authentic lockfile missing** |
| `npm run release:preflight:v51` | **BLOCKED: authentic lockfile missing** |
| `npm run build` | **FAIL: missing installed Node/NestJS types/dependencies**; dependency-backed compilation not established |
| npm registry network check | **FAIL: DNS `EAI_AGAIN`** |
| Real disposable PostgreSQL, HTTP and browser acceptance | **NOT EXECUTED** |
| Full Git history credential scan and deployment security gate | **NOT EXECUTED** |

Per-suite stdout/stderr logs from the v0.41–v0.83 regression checks, targeted older tests, the RED/GREEN comparison and release blockers are included in `test-evidence/v83/`. They contain no deliberate live credential data. A failing build caused by missing dependencies must not be counted as a proven TypeScript source defect.

**Overall verdict: source-security checkpoint PASS; production release NO-GO.**
