# AssetTrust v0.80 — Recorded Test Evidence

**Evidence scope:** Offline/local checks performed 12 November 2026. The build/dependency/live DB blockers are not counted as test passes.

| Execution | Recorded outcome |
|---|---|
| `npm run verify:v80` | PASS — 17 tests, 0 failures |
| `npm run verify:v79` | PASS — 23 tests, 0 failures |
| `npm run verify:v41` through `npm run verify:v80` | PASS — all 40 version commands, 735 counted TAP test successes |
| `npm run build:imports:v80` | PASS — 113 literal source imports reviewed; 18 distinct packages/workspaces |
| `npm run build:source:v56` | PASS — independent entry and relative import checks |
| `npm run verify:architecture` | PASS |
| `npm run verify:syntax` | PASS — syntax/transpilation, NOT semantic typechecking |
| `npm run verify:ci:v53` | PASS — CI YAML validation, 78 version scripts, 33 live PG contract scripts |
| `npm run security:scan:v43` | PASS — 3,540 current-source files; 0 high-confidence matches (limited scope) |
| Migration integrity comparison against v0.79 source ZIP | PASS — 27/27 SQL files byte-for-byte identical |
| `npm run lockfile:check:v55` | BLOCKED — authentic `package-lock.json` absent |
| `npm run release:preflight:v51` | BLOCKED — authentic lockfile not present |
| `npm run build` | BLOCKED — missing installed NestJS/PG/Node packages and typings |
| `npm ping --fetch-timeout=3000 --fetch-retries=0` | FAILED — `EAI_AGAIN registry.npmjs.org` |
| Real PostgreSQL, ClamAV, HTTP, browser, backup/restore | NOT EXECUTED |
| Full original Git-history secret audit | NOT EXECUTED |

### Red/green check

The previous v0.79 API manifest has `@types/express` but no direct `express` dependency. The new `build:imports:v80` guard would report the source imports as `UNDECLARED_DIRECT_IMPORT` until the direct runtime dependency is declared. v0.80 declares it in `apps/api/package.json`; tests cover both missing and correctly declared dependencies. This is **manifest-level evidence**, not proof of a successful npm resolution/build.

### Scope limits

The new static scanner covers literal source module specifiers; it does not prove TypeScript type correctness or dependencies' runtime compatibility. Npm registry access is unavailable in this execution environment. Final production approval is **NO-GO**.
