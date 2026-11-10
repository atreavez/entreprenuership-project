# AssetTrust v0.19 — test evidence and release decision

**Target:** v0.19 authentication response hardening and existing regression protection.
**Decision:** BLOCKED / DEVELOPMENT CHECKPOINT ONLY.

## RED → GREEN

- `test-evidence/v19/initial-red.log`: ran login tests against untouched v0.18 `AuthenticationService`; 2 tests failed and 1 passed. The absent-user path skipped `argon2.verify`.
- `test-evidence/v19/verify-v19.log`: same tests after applying the fix; 3 tests passed, 0 failed.
- The test uses transpiled real TypeScript login service code, with dependency stubs that record `argon2.verify` calls; it does **not** measure wall-clock side-channel resistance or exercise an actual database.
- Argon2 dummy digest validity was also checked with the local Python Argon2 implementation; this does not replace a Node.js Argon2 runtime test.

## Regression results

Each command's complete output is stored under `test-evidence/v19/`, and the JSON summary is `regressions.json`.

| Check | Outcome |
|---|---|
| New `verify:v19` | PASS: 3/3 |
| Earlier `smoke:offline` and `verify:v03` … `verify:v18` | PASS: 17/17 commands |
| `verify:architecture` | PASS |
| `verify:syntax` | PASS |
| Combined previous offline commands | PASS: 19/19 |
| npm lockfile release gate | BLOCKED: no root `package-lock.json` |
| Complete build | BLOCKED: missing `@types/node` (TS2688) |
| Live PostgreSQL/PostGIS | NOT RUN |
| Real React + API browser E2E | NOT RUN |

## Follow-up

On the user's network-connected Kali system: generate and review a real npm lockfile, install dependencies reproducibly, run the complete build, and execute PostGIS-backed HTTP and browser tests. Do not confuse green offline checks with successful deployment.
