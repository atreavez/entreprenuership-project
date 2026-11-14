# AssetTrust v0.23 — Recorded Test Evidence and Release Decision

Compiled by Aturinzire Hargreave

## New changes

The new transactional authorization adapter applies to asset and confidential-case contribution permissions and is invoked in the document upload, parcel draft, submission and review write transactions. All checks remain organization-scoped. `CONTRIBUTE` grants must be current; `READ` grants are insufficient. Locks reduce authorization-check/write race exposure.

## Recorded checks from this checkpoint

| Check | Result | Evidence |
|---|---|---|
| Initial v0.23 RED run (before implementation) | 0/10 passing, expected failures | Test-first terminal execution, prior to adapter implementation |
| New v0.23 tests with isolated adapter typecheck | **14/14 passed**; typecheck passed | `test-evidence/v23/verify-v23.log` |
| Earlier v0.3–v0.22 verification scripts | **20/20 passed** | `test-evidence/v23/summary.txt` and versioned logs |
| Architecture verification | Passed | `test-evidence/v23/verify-architecture.log` |
| TS/TSX syntax validation | **55 files, 0 syntax diagnostics** | `test-evidence/v23/verify-syntax.log` |
| GitHub Actions workflow parse | Passed using local YAML parser | Developer-side verification |
| New live PostgreSQL authorization suite | Written and wired into CI, **NOT RUN** | `tools/e2e-pg-access-v23.mjs` |
| Unapproved live PostgreSQL test | Rejected as intended | `test-evidence/v23/pg-test-safety.log` |
| Strict dependency release gate | **Blocked** (authentic `package-lock.json` missing) | `test-evidence/v23/release-gate.log` |
| Full NestJS/React build | **Failed** due to missing packages/types | `test-evidence/v23/full-build.log` |
| Real browser end-to-end verification | **NOT RUN** | Requires a successful app build and running API |

Total passing offline verification commands: **23 of 23** (the 21 versioned scripts `verify:v03`–`verify:v23`, plus architecture and syntax). The release gate and build are not counted among the passes.

### Build blocker details

The `npm` registry cannot be reached from this execution environment (`EAI_AGAIN`). `npm run build` attempts the API TypeScript build but fails with `TS2688` for unavailable `@types/node`, along with missing NestJS and other package declarations. A true npm-generated lockfile is absent. No public release should bypass these findings.

### Limits of this evidence

The new tests exercise the actual shared TypeScript authorization adapter after transpilation, and the document upload service with a controlled query-and-storage substitute. The tests do **not** prove that PostgreSQL interprets the row-locking SQL exactly as intended or that the full API and browser run together. The new `test:pg:access:v23` script is a required live gate, not a completed test. Independent concurrent-revocation tests are a remaining staging task.

**Release verdict: BLOCKED / NOT PRODUCTION READY.** The source is a security-focused development checkpoint; future work must prioritize a real dependency install, complete build, real PostgreSQL/PostGIS integration and browser test evidence.
