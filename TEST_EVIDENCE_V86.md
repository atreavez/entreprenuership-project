# AssetTrust v0.86 — Test Evidence

Date: 2026-11-12. Environment: isolated Node 22.16.0 / npm 10.9.2, TypeScript 5.8.3 globally, **no local npm dependencies, no genuine lockfile, no running PostgreSQL/PostGIS**.

| Verification | Observed result |
|---|---|
| New v0.86 synthetic provenance tests | **34/34 PASS** |
| Historical + current versions v41–v86 | **46/46 PASS** |
| Counted passing TAP cases | **949** |
| Architecture | PASS |
| TypeScript syntax/transpile (not dependency typecheck) | PASS |
| Direct dependency-import policy | PASS |
| Prior CI policy regression | PASS |
| Source secret snapshot | PASS, 3867 files scanned, no high-confidence matches |
| All 27 SQL migrations | Unchanged from v0.85 (byte-for-byte SHA-256 comparison) |
| Genuine lockfile / npm registry | BLOCKED, no lockfile; npm registry `EAI_AGAIN` |
| `npm run build` | FAILED: missing NestJS, Node and other required packages/type declarations |
| `npm run release:preflight:v51` | BLOCKED: authentic reviewed lockfile missing |
| `npm run acceptance:provenance:inspect:v86` | BLOCKED (expected): no real supervised build evidence |
| `npm run security:scan:v54` | BLOCKED (expected): original Git history absent |
| Real PostgreSQL and browser tests | NOT EXECUTED |
| Production release | **NO-GO** |

### Evidence files in complete project

- `test-evidence/v86/regression-matrix.json` — names, exit status and TAP counts for every version.
- `test-evidence/v86/version-suites/v41.log` through `v86.log` — one log per completed version suite.
- `test-evidence/v86/checks/` — command output and failure evidence for syntax, architecture, import policy, registry/lockfile-dependent checks, build plan, release preflight, and credential scanning.

The **synthetic** positive build fixture uses fake npm process results and deliberately synthetic fixture files. It proves the decision logic does not accept evidence after file changes, **not** that an actual compiler produced deployment artifacts. Genuine live acceptance is blocked and has not been asserted as passed.
