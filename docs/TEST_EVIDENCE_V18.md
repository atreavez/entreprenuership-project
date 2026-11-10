# AssetTrust v0.18 — Reproducible Test Evidence

**Compiled by: Aturinzire Hargreave**  
**Date:** 8 November 2026

## Results run in this workspace

| Command | Exit code | Interpretation |
|---|---:|---|
| `smoke:offline` | 0 | PASS (offline) |
| `verify:v03` | 0 | PASS (offline) |
| `verify:v04` | 0 | PASS (offline) |
| `verify:v05` | 0 | PASS (offline) |
| `verify:v06` | 0 | PASS (offline) |
| `verify:v07` | 0 | PASS (offline) |
| `verify:v08` | 0 | PASS (offline) |
| `verify:v09` | 0 | PASS (offline) |
| `verify:v10` | 0 | PASS (offline) |
| `verify:v11` | 0 | PASS (offline) |
| `verify:v12` | 0 | PASS (offline) |
| `verify:v13` | 0 | PASS (offline) |
| `verify:v14` | 0 | PASS (offline) |
| `verify:v15` | 0 | PASS (offline) |
| `verify:v16` | 0 | PASS (offline) |
| `verify:v17` | 0 | PASS (offline) |
| `verify:v18` | 0 | PASS (offline) |
| `verify:architecture` | 0 | PASS (offline) |
| `verify:syntax` | 0 | PASS (offline) |
| `npm run release:gate:v17` | 1 | BLOCKED (expected release gate) |
| `npm run build` | 2 | FAILED / prerequisite unavailable |
| `npm ci --offline` | 1 | FAILED / prerequisite unavailable |

**Full build failure:** TS2688 (`@types/node` unavailable); see `test-evidence/v18/npm_run_build.log`.
**Dependency failure:** no authentic `package-lock.json` and npm registry DNS lookup returned `EAI_AGAIN`.
**Database:** no Docker or PostgreSQL in this environment; live migrations and HTTP tests were NOT RUN.

## Test-first evidence

- `red-recovery-regression.log`: intentionally tested original vulnerable SQL. At least one regression failed as expected.
- `green-recovery-regression.log`: original source restored with one-time-use fix, suite passed 5/5.
- The runtime harness executes `AuthenticationService.disableMfa()` with a small mocked DB. It is not a substitute for live PostgreSQL.
- No new UI screens were made in this security-only phase; existing black/gold/green desktop and mobile designs were retained.

## Release decision

**BLOCKED — NOT PRODUCTION READY.** Do not interpret syntax tests or mock database tests as complete integration verification.
