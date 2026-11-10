# AssetTrust v0.21 — Actual Verification Evidence

**Checkpoint:** Current surveyor authorization and disposable PostgreSQL test setup.  
**Build host:** Isolated source-development environment without npm workspace dependencies, Docker or PostgreSQL.  
**Release decision: BLOCKED / NOT PRODUCTION READY.**

## Test-first evidence

`test-evidence/v21/red-v21.log`: initial repository tests against the v0.20 implementation: **3 passed, 5 failed** (expected RED).

`test-evidence/v21/green-v21.log`: same 8 tests after transaction-scoped professional accreditation checks: **8 passed, 0 failed**.

`npm run verify:v21` after adding six disposable-DB policy tests and two build-safety tests: **16 passed, 0 failed**. See `test-evidence/v21/verify-v21.log`.

Build-safety RED/GREEN: one new test initially failed because `apps/api/tsconfig.json` lacked `noEmitOnError`; after enabling it, both build-safety tests passed. Reattempting the complete build still failed at `TS2688`, but with a clean `dist/` directory it produced **no API JavaScript output**. See `build-safety-red.log` and `build.log`.

## Regression run

**22/22 offline verification scripts returned exit code 0**:

- `smoke:offline`
- `verify:v03` through `verify:v21`, inclusive
- `verify:architecture`
- `verify:syntax`

Full stdout/stderr per script and each exit status are included in `test-evidence/v21/` and `regression-summary.json`.

## Unresolved release gates (attempted)

| Gate | Observed result | Evidence |
|---|---|---|
| `npm run build` | Fails `TS2688: Cannot find type definition file for 'node'` — npm packages missing; not a full typecheck | `build.log` |
| `npm run release:gate:v17` | Intentionally fails: `package-lock.json` does not exist | `release-gate.log` |
| `npm run test:pg:parcel-auth:v21` without test configuration | Correctly rejects execution before connecting: explicit mutation authorization required | `postgres-integration.log` |
| Real PostgreSQL/PostGIS authorization assertion | Not run: no available local PostgreSQL service or npm `pg` | Not available |
| Full HTTP, browser and deployment checks | Not run | Not available |

These results support the source-level security correction; they **do not** establish a fully working integrated application.

## Security notes

The repository's current accreditation, role, organization and MFA constraints must be checked within one transaction, and the `FOR SHARE` locks held through the asset/claim update. Do not replace these guards with a cached JWT claim. The on-disk verification suite uses synthetic identities and data, not real land titles.
