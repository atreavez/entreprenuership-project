# AssetTrust v0.22 — Verified test evidence and blockers

## Recorded in this environment
- Source: v0.21 ZIP extracted, patched in place as v0.22.
- RED stage: `tools/tests-v22/professional-session-expiry.test.cjs` failed **5 of 8** assertions against v0.21 (expired session accepted or missing SQL expiry guard). See `test-evidence/V22_RED.log`.
- GREEN stage: 8/8 tests pass against v0.22. See `test-evidence/V22_GREEN.log`.
- Full offline regression: **23/23 commands passed** (smoke:offline, verify:v03 to verify:v22 inclusive, verify:architecture, verify:syntax). See `test-evidence/V22_REGRESSION_SUMMARY.txt` and individual logs.
- TS/TSX syntax: 54 files, zero transpile syntax diagnostics; not a typecheck.
- CI workflow: `.github/workflows/ci.yml` parsed successfully as YAML. This is **not** a successful hosted CI execution.
- Safe failure of PostgreSQL smoke command without `ASSETTRUST_E2E_ALLOW_MUTATION=YES`: confirmed, see `V22_PG_ATTEMPT.log`. SQL itself has **not** been executed against Postgres.
- `npm run release:gate:v17` fails with missing authentic `package-lock.json`; see `V22_RELEASE_GATE.log`.
- `npm run build` fails with third-party module and `@types/node` TypeScript errors; see `V22_BUILD_ATTEMPT.log`. API/Web build was not successful.
- PostgreSQL and Docker CLI binaries not present; `node_modules` not installed. No live API/browser test performed.

## Live PostgreSQL test to be run on Kali/GitHub Actions
`npm run test:pg:trust-session:v22` uses `tools/e2e-pg-trust-session-v22.mjs`, reading the exact SQL strings from the current TypeScript source, not independent copies. Its 21 database assertions cover:
1. Active session / appointment / MFA succeeds.
2. Expired session fails despite recent MFA.
3. Revoked session fails.
4. MFA verification older than 15 minutes fails.
5. Disabled MFA fails.
6. Disabled platform appointment fails.
7. Restored valid session/appointment succeeds.

**Execution status: NOT RUN against live Postgres here.**

## Limits and release decision
The v0.22 fix is offline-tested. No proof of production readiness is asserted. Blockers: authentic lockfile, complete dependency installation, successful full build, real PostgreSQL/PostGIS, supervised HTTP and browser E2E evidence. Release decision **BLOCKED**.
