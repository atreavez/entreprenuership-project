# AssetTrust v0.59 — Test evidence

**Evidence date:** 11 November 2026. All commands below ran against the attached source directory. This is **not** proof that PostgreSQL, ClamAV, npm registry or production systems operated successfully.

## Verified PASS

| Check | Result | Evidence |
|---|---|---|
| v0.59 new offline unit/guard suite | 15 / 15 PASS | `test-evidence/v59/logs/verify-v59.log` |
| Historical offline regression matrix v0.03–v0.59 | 57 / 57 PASS | 57 individual `test-evidence/v59/logs/` files plus four matrix summaries |
| Parser-backed CI YAML / release command coverage | PASS | `test-evidence/v59/npm-run-verify-ci-v53.log` |
| CI static script coverage | PASS | `test-evidence/v59/npm-run-verify-ci-v41.log` |
| Architecture and domain boundaries | PASS | `test-evidence/v59/npm-run-verify-architecture.log` |
| TypeScript/TSX syntax check | PASS (104 files, transpile only) | `test-evidence/v59/npm-run-verify-syntax.log` |
| Pre-install Vite/source graph | PASS | `test-evidence/v59/npm-run-build-source-v56.log` |
| Offline smoke | PASS | `test-evidence/v59/npm-run-smoke-offline.log` |
| High-confidence current-source credential scan | PASS (0 flagged of 2,611 source files) | `test-evidence/v59/npm-run-security-scan-v43.log` |
| SQL migration integrity against v0.58 | 25 / 25 byte-identical | Source migration SHA-256 comparison |
| Unsafe live invocation guard | Correctly BLOCKED | `test-evidence/v59/live-db-guard-blocked.log` |

## Explicit BLOCKERS / NOT EXECUTED

- Real PostgreSQL functional tenant CRUD: **NOT RUN** (no local PostgreSQL, `pg` package or separate runtime login in this environment). The v0.59 tests exercise validation code and command wiring, not live policy enforcement.
- Reproducible npm install: **BLOCKED** (`package-lock.json` absent; npm registry DNS lookup failed). Do not synthesize the lockfile.
- `npm run build`: **FAILED**, missing installed Node typings, NestJS/pg dependencies. This is not evidence of a correct compilation.
- Release preflight: **BLOCKED**, 3 of 11 prerequisites present (`test-evidence/v59/release-preflight-v41.log`).
- Real ClamAV, two-API HTTP, browser flows, backup/restore, Git-history scan, TLS deployment, penetration and legal review: **NOT RUN HERE**.

## Auditability and safety

The v0.59 live contract requires `ASSETTRUST_V59_CRUD_CONFIRM=YES`, `CI=true`, `NODE_ENV=test`, v0.57 restricted role enforcement, v0.58 seeded confirmation and the original disposable DB safety checks. It never writes to production intentionally. If interrupted, discard the entire disposable test database rather than trying to trust partially cleaned fixtures.

**Verdict:** OFFLINE DEVELOPMENT CHECKPOINT PASSED. **PRODUCTION RELEASE NO-GO.**
