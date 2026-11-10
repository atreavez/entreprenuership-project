# AssetTrust v0.20 — Test evidence and release decision

**Compiled by: Aturinzire Hargreave**

## RED → GREEN

`test-evidence/v20/RED_initial_test_failures.log` contains the initial run of the five tests against the original v0.19 logic: **1 passed / 4 failed**. The failures documented the missing step-up invalidation and missing live MFA check in the parcel review path.

After implementing the fix and adding two runtime repository checks, `npm run verify:v20`: **7 passed / 0 failed**. See `test-evidence/v20/verify_v20.log`.

The tests execute actual transpiled TypeScript service/repository methods using controlled SQL substitutes; they do **not** prove that PostgreSQL executes the new SQL successfully.

## Regression

All previous offline checks succeeded:

`smoke:offline`, `verify:v03`, `verify:v04`, `verify:architecture`, `verify:v05`, `verify:v06`, `verify:v07`, `verify:v08`, `verify:v09`, `verify:v10`, `verify:v11`, `verify:v12`, `verify:v13`, `verify:v14`, `verify:v15`, `verify:v16`, `verify:v17`, `verify:v18`, `verify:v19`, `verify:syntax`.

The command outputs are retained under `test-evidence/v20/`.

## Build, network, and release gate

- `npm run release:gate:v17` **failed as intended**: `package-lock.json` missing. See `release_gate.log`.
- `npm run build` **failed**: `TS2688 Cannot find type definition file for 'node'`. See `build.log`.
- A direct npm registry request failed with DNS error **EAI_AGAIN**, so npm dependencies could not be retrieved.
- PostgreSQL/PostGIS and a complete browser runtime were not available. No live API/DB test is claimed.

## Security outcomes and remaining uncertainties

- MFA disable now clears stale step-up across all of the user's sessions, including the current one.
- Parcel-review authorization explicitly checks MFA enabled and recent verification, holding locks on the credential and session rows during review.
- Integration behavior, migrations, and authorization under real concurrent PostgreSQL connections **must be retested** before production.

**Release decision: BLOCKED / NOT PRODUCTION-READY.**
