# AssetTrust v0.28 — Test Evidence and Release Decision

**Date:** 10 November 2026. **Credit:** Compiled by Aturinzire Hargreave.

## Actual results

| Validation | Observation | Verdict |
|---|---|---|
| v0.28 domain + service + bootstrap tests | **29/29** pass via `npm run verify:v28` | PASS (offline) |
| Strict isolated config-domain TS typecheck | Included in `verify:v28` | PASS |
| Full offline regression set | **29/29 npm commands passed**, including `smoke:offline`, `verify:v03` through `verify:v28`, architecture and syntax | PASS (offline) |
| TS/TSX transpile syntax | 63 files; 0 syntax diagnostics | PASS (not a build) |
| v0.11 migration and baseline regression | 18/18 after updating for 009; baseline caps legacy at 008 | PASS (offline) |
| React source-derived static preview | Admin organization desktop **1440px**, mobile **390px** and global desktop **1440px** rendered | PASS for static preview |
| Horizontal overflow | Browser checks: document width = viewport at 1440px and 390px | PASS |
| SQL migration source manifest | Checksummed migration `009`, prior 001–008 unchanged | PASS (source) |
| GitHub Actions | `verify:v28` and guarded disposable PostgreSQL check added | CONFIGURED, not executed |
| `npm ci --offline` | Exits nonzero because authentic `package-lock.json` missing | BLOCKED |
| `npm run release:gate:v17` | Fails correctly: missing reviewed npm lockfile | BLOCKED |
| `npm run build` | Fails on missing `@types/node`, NestJS and other unavailable dependencies | BLOCKED |
| Live disposable PostgreSQL test | Script fails safely without explicit disposable mutation authorization; no PostgreSQL integration run | NOT EXECUTED |
| API/browser full E2E | No live application with database available | NOT EXECUTED |

## RED / GREEN test-first evidence

`tools/tests-v28/admin-domain.test.cjs` initially failed 10/10 because the config-domain module did not exist (saved `/mnt/data/v28-red.log` in the working session). After implementing typed allowlist policy, all 10 passed. The full v0.28 suite subsequently expanded to **29 passing tests**. This is evidence of test-first development, not a claim that every integration is exercised.

## Security checks covered

- Current database membership and session enforcement; no reliance on old JWT role for protected write.
- Active MFA and recent step-up required for configuration writes.
- Separate global appointment check before platform settings or directory access.
- Tenant-scope enforced from authenticated organization ID, not arbitrary client-selected organization ID.
- Unknown keys, dangerous security bypass keys, invalid types, unsafe inputs and versions rejected.
- Optimistic version check and key-level advisory lock for competing edits.
- High-impact pending changes are not applied until a **different** currently authorized administrator approves; self-review denied.
- Proposal rejection does not change applied value; history and audit events retained.
- Dry-run-by-default, operator-controlled bootstrap rejects missing credentials or confirmations.
- Legacy baseline does not falsely record v0.28 migration as applied.

## Where to find proof

- `test-evidence/v28-all-offline-regression.log`: all 29 offline command outputs.
- `test-evidence/v28-new-suite.log`: 29 v0.28 test cases.
- `test-evidence/v28-migration-validation.log`: migration policy checks.
- `test-evidence/v28-full-build.log`: actual build failure.
- `test-evidence/v28-npm-ci.log`: missing npm lockfile.
- `test-evidence/v28-release-gate.log`: fail-closed release gate.
- `test-evidence/v28-postgres-safety.log`: live test refuses unapproved DB writes.
- `screenshots/v28-admin-control-desktop.png`, `v28-admin-control-mobile.png`, `v28-admin-platform-desktop.png`: source-derived previews.

## Production-release verdict

**NOT APPROVED FOR PRODUCTION.** The backend, frontend, PostgreSQL/PostGIS and browser have not been proven to work together. Obtain a real npm-generated lockfile on an internet-connected machine, install dependencies, fix any subsequent compiler issues, run migrations on disposable PostGIS, execute authenticated HTTP/API/browser tests and perform a security review of the privileged operator bootstrap and the complete authorization flow.
