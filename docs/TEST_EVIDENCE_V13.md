# AssetTrust v0.13 — Test Evidence and Limitations

Compiled by **Aturinzire Hargreave**.

## RED → GREEN

RED: tests rejected embedded fixed CI secrets, missing per-run secret generation, an absent runtime preflight, and an unsupervised live HTTP runner. An additional test exposed that `replace-in-deployment` was not rejected by the existing startup placeholder policy.

GREEN: 20 new v0.13 tests passed after introducing the new CI workflow, preflight, test-runner policy, and corrected placeholder detection.

## Tests executed here

| Command | Result |
|---|---|
| `npm run smoke:offline` | PASS |
| `npm run verify:v03` | PASS (17 structural/policy checks) |
| `npm run verify:v04` | PASS (3) |
| `npm run verify:architecture` | PASS (3) |
| `npm run verify:v05` | PASS (21) |
| `npm run verify:v06` | PASS (20) |
| `npm run verify:v07` | PASS (15) |
| `npm run verify:v08` | PASS (15) |
| `npm run verify:v09` | PASS (Node policy tests + 10 Python tests) |
| `npm run verify:v10` | PASS (Node policy tests + 11 Python tests) |
| `npm run verify:v11` | PASS (18) |
| `npm run verify:v12` | PASS (22) |
| `npm run verify:v13` | PASS (20) |
| `npm run verify:syntax` | PASS (54 TS/TSX files transpile, zero syntax diagnostics) |
| Node syntax checks for three new CI modules | PASS |
| CI workflow YAML parsing | PASS |

Logs are bundled in `test-evidence/v13/`.

## Commands attempted but blocked

- `npm run build`: FAIL / BLOCKED at TS2688 — Cannot find `@types/node`; project dependencies are not installed.
- `npm test`: FAIL / BLOCKED at TS2307 — Cannot resolve `@nestjs/common` and `pg`.
- `npm ping`: FAIL / BLOCKED at EAI_AGAIN — npm registry DNS resolution unavailable.
- Live PostgreSQL/PostGIS/API E2E: NOT EXECUTED — database runtime unavailable.
- GitHub Actions CI and browser tests: NOT EXECUTED here.

Offline passing results do not establish end-to-end correctness or readiness for production use.
