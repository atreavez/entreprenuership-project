# AssetTrust v0.66 — Offline Test Evidence

**Date:** 11 November 2026. **Production release: NO-GO.**

| Gate | Result | Evidence |
|---|---|---|
| New `verify:v66` tests | 25 PASS / 0 FAIL | `test-evidence/v66/verify-v66.log` |
| Regression scripts `verify:v54` to `verify:v66` | 13/13 PASS, 237 case executions | `test-evidence/v66/verify-v*.log` |
| Architecture boundaries | PASS | `test-evidence/v66/architecture.log` |
| TS/TSX syntax (not full typecheck) | PASS, 105 files | `test-evidence/v66/syntax.log` |
| Vite/source relative import preflight | PASS, 102 files/285 imports | `test-evidence/v66/source-preflight.log` |
| CI completeness and Ruby YAML policy | PASS | `test-evidence/v66/ci-completeness-v41.log` + `ci-yaml-v53.log` |
| v51 release preflight | BLOCKED | `test-evidence/v66/release-preflight-v51.log` |
| Genuine npm lockfile, npm ci, API/web build | NOT VERIFIED | No lockfile or dependencies; registry DNS EAI_AGAIN |
| Live PostGIS, ClamAV, original Git history, official registry, real Nest/browser E2E | NOT VERIFIED | No connected infrastructure or original history |

Tests exercise actual transpiled domain/application infrastructure code in a controlled fake DB and a local mock HTTP server. They are **not** a substitute for live PostGIS and deployed NestJS testing. Only a reviewed connected-Kali run with credential-safe logs can close the blockers.
