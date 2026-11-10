# AssetTrust v0.15 — Test evidence and release decision

**Date:** 7 November 2026 | **Compiler:** Aturinzire Hargreave

| Check | Observed result | Evidence |
|---|---|---|
| TDD RED: missing run-scoped marker policy | Expected failure | `test-evidence/v15/RED.log` |
| TDD RED: CI preflight accepted absent markers | Expected failure | `test-evidence/v15/RED-missing-preflight-check.log` |
| v0.15 independent policy + real localhost HTTP tests | PASS, 10/10 | `test-evidence/v15/GREEN.log` |
| Earlier offline suites v0.3–v0.14 | PASS on last individual runs; consolidated runner later reached execution limit during v0.15 | `test-evidence/v15/REGRESSION.log` |
| Architecture rules | PASS, 3/3 | `test-evidence/v15/ARCHITECTURE_SYNTAX.log` |
| Syntax validation | PASS, 54 TS/TSX | `test-evidence/v15/ARCHITECTURE_SYNTAX.log` |
| Full API/React build | BLOCKED (`TS2688: @types/node`) | `test-evidence/v15/BUILD_ATTEMPT.log` |
| Dependency preflight | BLOCKED (12 missing of 14 selected packages; no lockfile) | `test-evidence/v15/PREFLIGHT.log` |
| CI YAML parse | PASS via PyYAML | Recorded during build checks |
| Live PostgreSQL/PostGIS migration | NOT RUN | Database unavailable |
| Live NestJS HTTP and React browser E2E | NOT RUN | Dependencies unavailable |

**Release decision: NO-GO.** These changes reduce accidental test-target mix-ups; they do not establish production readiness.
