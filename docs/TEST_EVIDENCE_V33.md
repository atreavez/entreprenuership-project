# AssetTrust v0.33 — Verified Test and Release Evidence

## Scope and release decision

**Development checkpoint, NOT production-approved.** v0.33 introduces administrator-controlled *staging* of notification provider routes. No outbound email or SMS transport is implemented, configured, verified or enabled by this release.

## Positive evidence from this execution environment

| Check | Observed result | Recorded evidence |
|---|---|---|
| Domain/provider-service/SQL-integrity policy tests | **27/27 passed** | `test-evidence/v33-final-tests.log` |
| Historic offline check commands plus new suite | **33 commands completed successfully**, from `smoke:offline`, `verify:v03` through `verify:v33` and `verify:architecture` | `test-evidence/v33-regression-*.log` |
| TypeScript/TSX source syntax scan (run separately after batch time limit) | **78 files, 0 syntax errors** | `test-evidence/v33-syntax.log` |
| Isolated strict provider domain typecheck | **Passed** | `verify:v33` script and log |
| Historical migration integrity | **001–012 SQL bytes unchanged; new 013 checksum matches manifest** | `tools/tests-v33/provider-integrity.test.cjs`, `verify:v11` |
| CI YAML parsing | **Passed** | local YAML parse; workflow updated for `verify:v33` and disposable SQL contract |
| Desktop source-based preview (1440px) | **Rendered; no horizontal overflow** | `screenshots/v33-provider-desktop.png`, `test-evidence/v33-preview-check.log` |
| Mobile source-based preview (390px) | **Rendered; no horizontal overflow** | `screenshots/v33-provider-mobile.png`, `test-evidence/v33-preview-check.log` |
| PostgreSQL test safe refusal without explicit disposable authorization | **Refused before connection, as designed** | `test-evidence/v33-pg-refusal.log` |

The initial test-first (RED) run occurred before the provider-policy source existed and recorded expected test failures; the subsequent policy and service tests pass. See `test-evidence/v33-red.log`, `v33-green-policy.log` and `v33-final-tests.log`.

## Negative/unverified evidence

| Gate | Result | Evidence |
|---|---|---|
| `npm ci` | **FAILED**: no authentic reviewed `package-lock.json` | `test-evidence/v33-npm-ci.log` |
| `npm run release:gate:v17` | **FAILED as expected**: missing lockfile | `test-evidence/v33-release-gate.log` |
| Registry availability | **FAILED**: `EAI_AGAIN` resolving `registry.npmjs.org` | `test-evidence/v33-npm-ping.log` |
| Full NestJS/React build | **FAILED**: unavailable `@types/node`, NestJS dependencies and related packages | `test-evidence/v33-full-build.log` |
| `npm run test:pg:providers:v33` against a real PostgreSQL server | **NOT EXECUTED** (refusal run only) | Requires disposable localhost database, `pg` package and explicit permission |
| Actual React/Vite browser runtime | **NOT EXECUTED** | Screenshots use the source JSX renderer with fictional fixtures, not Vite runtime |
| Real external email or SMS delivery | **NOT IMPLEMENTED** | `STAGED` is explicitly not `LIVE`; existing disabled delivery adapter remains in place |
| Production security audit/penetration test | **NOT PERFORMED** | Must precede real deployments |

The historical regression batch was interrupted by a combined execution time limit *after* 33 successful commands; the source syntax scanner was run independently afterward. We do not count the interrupted all-in-one runner as completed.

## Remaining gates before release

1. On a connected development machine generate, review and commit an authentic npm lockfile, then run `npm ci`, full `npm run build`, and CI.
2. Provision disposable PostgreSQL/PostGIS, apply checksum-verified migrations, and execute `npm run test:pg:providers:v33` plus the earlier integration tests.
3. Run real authenticated browser/API tests for proposal, current-MFA, tenant isolation, independent approval and stale-version behavior.
4. Design and implement vetted provider adapters with a secret manager, consent/suppression, delivery receipt verification, retries, audit/cost monitoring and privacy review before enabling any external messages.
5. Complete backup/restore, compliance, security review and deployment readiness gates.

## Software engineering standards

The module retains the project-wide **DDD, TDD, SOLID, Clean Architecture, and security-by-design** requirements. In particular, the pure domain is independent of infrastructure, the NestJS module mediates database interactions, the UI calls guarded endpoints, and SQL enforces tenant and approval invariants.
