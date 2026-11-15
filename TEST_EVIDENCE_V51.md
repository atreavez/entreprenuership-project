# AssetTrust v0.51 - Recorded engineering test evidence

Date: 11 November 2026. Commands executed against the extracted v0.51 source tree on the package-building environment (Node v22.16.0, npm v10.9.2). No PostgreSQL service or registry access was available.

## Passed (offline)

- **49/49 version verification scripts** (`verify:v03` to `verify:v51`), individual logs in `test-evidence/v51/verify-vNN.log`.
- **17/17 new v0.51 tests** in `tools/tests-v51/release-supply-chain.test.cjs`, including rejecting insecure dependency specifiers, invalid registries, unsafe/remote DB targets, absent authorizations, and mocked runner fail-closed behavior. **Mock successes do not prove live builds or database access.**
- `verify:ci:v41`: CI coverage checker includes 49 historical/current versions and 24 PostgreSQL contract scripts; workflow includes `supply-chain:v51` before `npm ci`.
- `verify:architecture`: PASS.
- `verify:syntax`: PASS (TypeScript source syntax/transpilation, NOT compiled application type checking).
- `smoke:offline`: PASS.
- `release:plan:v51`: PASS. Purely read-only, no database or package install.
- 25/25 schema migration source checksums match pinned manifest. No new/modified SQL migration.
- `node --check` of v0.51 new implementation and test files: PASS.

## Blocked and deliberately failed (not passed)

- `release:preflight:v51`: **BLOCKED**, missing authentic `package-lock.json`. Expected fail-closed result.
- `supply-chain:v51`: **BLOCKED**, missing authentic lockfile (registry DNS error `EAI_AGAIN` when requesting current package metadata).
- `npm ci --offline --ignore-scripts`: **FAILED**, npm EUSAGE due missing lockfile. **Do not claim build reproducibility.**
- `npm test`: **FAILED**, missing NestJS, pg, Node types and other dependencies.
- `npm run build`: **FAILED**, missing installed dependencies/type definitions.
- `test:pg:documents-rls:v50`: **NOT EXECUTED**, guard refused because explicit disposable database authorization was absent.
- `release:preflight:v41`: **BLOCKED**, 3/11 local prerequisites present. Its result explicitly has `productionApproved:false`.
- `--full` and `--database` against real PostgreSQL: **NOT RUN**. Full Git-history scanner, online npm audit, two-api authenticated browser flows and production infrastructure review: **NOT RUN**.

## Log locations

`test-evidence/v51/verify-v03.log` ... `verify-v51.log`, `verify-ci-v41.log`, `verify-architecture.log`, `verify-syntax.log`, `smoke-offline.log`, `release-plan-v51.log`, `release-preflight-v51.log`, `supply-chain-v51.log`, `npm-ci.log`, `npm-test.log`, `build.log`, `pg-test.log`, and `release-preflight.json`.

## Verdict

**NO-GO**. Offline tests validate policy design and test runner behavior only. Operator must use the real Git clone and a *fresh disposable loopback PostgreSQL/PostGIS database* with an authentic reviewed package lockfile. See `V51_KALI_VALIDATION.md` and `V51_SECURITY_REPORT.md`. Release approval requires independent evidence review after critical/high security issues are resolved.
