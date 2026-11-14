# AssetTrust v0.24 — Reproducible test evidence

Compiled by: Aturinzire Hargreave

## Executed locally

| Test | Actual result |
|---|---|
| v0.23 baseline assertion expecting transactional case evidence authorization | FAIL as expected (RED; missing helper call) |
| `node --test tools/tests-v24/*.test.cjs` | PASS — 16 tests |
| `tsc -p tools/tsconfig-v24.json` | PASS — strict isolated typecheck |
| All previous offline suites and supporting checks | PASS — 25 of 25 npm commands (`smoke:offline`, `verify:v03` through `verify:v24`, architecture and syntax) |
| TypeScript/TSX transpilation syntax check | PASS — 56 files, 0 syntax diagnostics |
| CI YAML parsing and script references | PASS — 17 CI steps, no missing package-script references |
| New PostgreSQL fixture safety refusal without explicit mutation approval | PASS — correctly refused to execute |
| ZIP integrity | Run and record as part of final packaging |

## Blocked or unexecuted

| Release gate | Result |
|---|---|
| npm registry dependency resolution | `EAI_AGAIN` DNS error, `registry.npmjs.org` |
| npm-generated `package-lock.json` | Absent; release gate FAILED as designed |
| Complete `npm run build` | FAILED on missing NestJS/argon2 dependencies and type definitions; not an application build success |
| Live v0.24 PostgreSQL authorization exercise | NOT RUN: no PostgreSQL server or installed `pg` package in this environment |
| Browser end-to-end tests | NOT RUN |

## Test nature
The 16 new tests exercise the real TypeScript authorization adapter and service methods using controlled database substitutes. They do NOT prove PostgreSQL row locking, database constraints, migration compatibility, React/NestJS integration, legal validity, or production security. The disposable PostgreSQL script must be executed separately after the full build and migrations pass.

Command logs are in `test-evidence/v24/`. No tests against real land or registry records were attempted.

**Release verdict: BLOCKED / NOT PRODUCTION-READY.**
