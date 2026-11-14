# AssetTrust v0.79 — Test evidence

**Run environment:** local sandbox, Node.js 22.16.0, npm 10.9.2, globally available TypeScript; no local `node_modules`, no authentic `package-lock.json`, no Docker/PostGIS runtime and no npm registry DNS resolution.

## Executed and passing

- `npm run verify:v79`: **23 / 23 PASS** (directly transpiled backend services, real current authority helpers and synthetic database behavior).
- `npm run verify:v41` through `npm run verify:v79`: **39/39 PASS**, **718 total TAP cases**; every suite completed, no remaining failed suites. See `v79_regressions` in internal build logs if available (not required for execution).
- `npm run verify:syntax`: **109** TS/TSX source files transpile, no syntax diagnostics (not a full typecheck).
- `npm run verify:architecture`: **3 / 3 PASS**.
- `node tools/build-artifact-gate-v56.cjs --source`: **PASS**, 106 source files and 296 relative imports.
- `npm run verify:ci:v53`: **PASS**, CI policy validator (77 version scripts, 33 PG contracts).
- `npm run security:scan:v43`: **PASS**, 3,533 snapshot files, zero high-confidence matches (limited; not full history).

## Relevant cases added in v0.79

1. Stale ORG_ADMIN JWT against current REVIEWER membership results in participant-only dashboard queries (all four query parameters checked).
2. Current ORG_ADMIN user with a stale REVIEWER JWT gets current DB-derived administrator scope.
3. Suspended membership fails before dashboard SQL.
4. Confidential report denies access after case membership/participation changes, before loading case/evidence/publication.
5. Report case metadata, evidence and published copy are all loaded while current case row is locked in one transaction.
6. Audit `verify` and `list` reject demoted and suspended administrators before reading the audit ledger; valid access remains tenant-scoped.
7. Audit integrity tampering still returns failure.
8. Integration `status` and `local-proof` reject demoted/suspended users; audit head remains scope-limited.
9. Original v0.48, v0.49, v0.50, v0.61 tests updated to assert **same-transaction** authorization and scope (not waived).

## Executed and blocked / not executed

- `npm run lockfile:check:v55`: **BLOCKED** — missing genuine `package-lock.json`.
- `npm run release:preflight:v51`: **BLOCKED** — missing genuine lockfile; release NO-GO.
- `npm run build`: **FAILED** — missing external packages and types (including NestJS, `pg`, `argon2`, `@types/node`). This does **not** establish that all source code typechecks once packages are installed.
- Real PostgreSQL, PostGIS, complete authenticated Nest HTTP, browser and independent adversarial tests: **NOT EXECUTED**.
- Full Git history secret scan: **NOT EXECUTED** because `.git` history is absent from checkpoint.

**Interpretation:** v0.79 source changes have passing offline regressions. They are not evidence of actual live revocation behavior or production readiness.
