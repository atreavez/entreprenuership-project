# AssetTrust v0.75 — Test evidence

**Date:** 2026-11-12  
**Scope:** offline source-level/regression verification, NOT live PostgreSQL acceptance.

| Check | Outcome | Evidence |
| --- | --- | --- |
| `npm run verify:v75` | PASS, 24/24 | `test-evidence/v75/version-suites/v75.log` |
| Version suites v0.41–v0.75 | PASS, 35/35 scripts, 598 counted TAP test successes | `test-evidence/v75/version-suites/*.log`, `matrix-41-60.json`, `matrix-61-75.json` |
| `npm run verify:architecture` | PASS, 3/3 | `test-evidence/v75/checks/architecture.log` |
| `npm run verify:syntax` | PASS, 108 TypeScript/TSX files | `test-evidence/v75/checks/syntax.log` |
| `npm run verify:ci:v53` | PASS | `test-evidence/v75/checks/ci.log` |
| `npm run security:scan:v43` | PASS, 3,441 current-source files, no high-confidence matches | `test-evidence/v75/checks/source-scan.log` |
| Migration source comparison | PASS, 27/27 unchanged against v0.74 | Source SHA-256 comparison |
| Reviewed RLS policy contract | UNCHANGED | `rls-policy-contract.ts` SHA-256 comparison |
| `npm run build:acceptance:inspect:v68` | BLOCKED (exit 1) | `test-evidence/v75/checks/build-inspect.log` |
| `npm run release:preflight:v51` | BLOCKED (exit 1) | `test-evidence/v75/checks/release-preflight.log` |
| `npm run build` | FAILED (exit 1), missing installed Node/NestJS/related dependencies | `test-evidence/v75/checks/full-build.log` |
| Live DB / real concurrency / browser / HTTP E2E | NOT RUN | No acceptable live evidence in this environment |

**Interpretation:** Passing these offline checks does not demonstrate that a complete running application, tenancy isolation, production payment flows or PostgreSQL locks work. Logs are provided for reproducibility and must not be altered to produce green badges.
