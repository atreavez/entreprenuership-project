# AssetTrust v0.30 — Test evidence and release decision

**Compiled by Aturinzire Hargreave.** Source checkpoint: v0.30.

## Scope and results
- **31/31 offline verification commands passed**, including historical v0.3–v0.29 policy/regression suites, new v0.30 suite, Clean Architecture and TypeScript syntax checks.
- v0.30 Node test suite: **24/24 passed** (policy validation, tenant-scoped independent approval, MFA, stale/duplicate revisions, additional evidence gates, case advancement, SQL migration invariants).
- The v0.30 pure domain and application TypeScript files also passed isolated `tsc --noEmit --strict` checks, but this is **not** a full NestJS/API/web build.
- Source-based React previews rendered at 1440 px desktop and 390 px mobile. Both had document widths equal to their viewports, with no horizontal page overflow. They are **not** live React browser integration tests.
- GitHub Actions references the new `verify:v30` and `test:pg:workflows:v30` commands. CI was written but **not executed here**.

## Release blockers observed directly
| Gate | Attempted | Result |
|---|---|---|
| `npm ci --offline` | Yes | Exit code 1; blocked by missing genuine `package-lock.json` |
| `npm run release:gate:v17` | Yes | Exit code 1; rejects the missing lockfile |
| `npm run build` | Yes | Exit code 1; missing NestJS packages and Node.js typings prevent API build |
| Live PostgreSQL/PostGIS migration and v0.30 SQL test | No | No PostgreSQL or Docker service installed in this container. Script fails closed without explicit test authorization. |
| Real React/API browser end-to-end | No | Cannot be executed without a successful application build and running database. |

**Release verdict: BLOCKED — not production-ready.** Passing offline tests is not evidence of successful full runtime integration. Do not ship a partially compiled or unverified server.

## Regression command results
| Command | Result |
|---|---|
| `npm run smoke:offline` | PASS |
| `npm run verify:architecture` | PASS |
| `npm run verify:v03` | PASS |
| `npm run verify:v04` | PASS |
| `npm run verify:v05` | PASS |
| `npm run verify:v06` | PASS |
| `npm run verify:v07` | PASS |
| `npm run verify:v08` | PASS |
| `npm run verify:v09` | PASS |
| `npm run verify:v10` | PASS |
| `npm run verify:v11` | PASS |
| `npm run verify:v12` | PASS |
| `npm run verify:v13` | PASS |
| `npm run verify:v14` | PASS |
| `npm run verify:v15` | PASS |
| `npm run verify:v16` | PASS |
| `npm run verify:v17` | PASS |
| `npm run verify:v18` | PASS |
| `npm run verify:v19` | PASS |
| `npm run verify:v20` | PASS |
| `npm run verify:v21` | PASS |
| `npm run verify:v22` | PASS |
| `npm run verify:v23` | PASS |
| `npm run verify:v24` | PASS |
| `npm run verify:v25` | PASS |
| `npm run verify:v26` | PASS |
| `npm run verify:v27` | PASS |
| `npm run verify:v28` | PASS |
| `npm run verify:v29` | PASS |
| `npm run verify:v30` | PASS |
| `npm run verify:syntax` | PASS |

## Test-first evidence
The first v0.30 policy tests failed against the missing workflow-domain implementation (RED; saved outside the package in development logs). Implementing the policy and adding the service/repository integration made the final 24-test suite pass (GREEN). Follow-on tests rejected previously ignored request fields, which were then validated explicitly. Production PostgreSQL SQL execution is not claimed.

## Artifact references
- `tools/tests-v30/` — all new offline tests.
- `test-evidence/v30/*.log` and `regression-results.json` — command output and status records.
- `test-evidence/v30/full-build-attempt.log`, `npm-ci-attempt.log`, `release-gate.log` — concrete remaining blockers.
- `docs/V30_WORKFLOW_ADMIN_ARCHITECTURE.md` — boundaries, constraints and endpoint contract.
- `docs/V30_KALI_VALIDATION.md` — connected Kali installation, safe migration and acceptance scenario.
