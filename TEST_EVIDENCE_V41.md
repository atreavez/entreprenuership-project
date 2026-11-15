# AssetTrust v0.41 — Test evidence and release decision

**Date:** 11 November 2026. **Scope:** GitHub Actions version/SQL gate completeness, read-only release preflight, isolated two-session PostgreSQL contract safety, and historical offline regression. **Decision: NOT PRODUCTION READY.**

## Observed results, executed in this sandbox

| Gate | Actual observation | Retained evidence |
| --- | --- | --- |
| New v0.41 focused tests | **9/9 PASS** | `test-evidence/v41/verify-v41.log` |
| Historical + current version scripts (`verify:v03` to `verify:v41`) | **39/39 PASS** | All `test-evidence/v41/verify-vNN.log`; `results.json` |
| Static GitHub Actions coverage | **PASS**: 39 version scripts and all 17 `test:pg:*` scripts are referenced by the workflow | `test-evidence/v41/verify-ci.log` |
| Architecture tests | **PASS** | `test-evidence/v41/verify-architecture.log` |
| TypeScript / TSX syntax-only transpile | **PASS**: 92 files, zero syntax diagnostics | `test-evidence/v41/verify-syntax.log` |
| Migration source integrity | **PASS**: all 18 SQL migration files byte-for-byte unchanged from v0.40; manifest matches | v0.41 source assertions and `results.json` |
| GitHub workflow YAML parsing | **PASS** (PyYAML `jobs` present; note the YAML 1.1 `on` key conversion) | `test-evidence/v41/yaml-check.txt` |
| v0.41 script syntax (Node `--check`) | **PASS** | source check command |
| Read-only release preflight | **BLOCKED as expected**, only 3/11 prerequisites present | `test-evidence/v41/release-preflight.log` |
| `npm ci --offline --ignore-scripts --dry-run` | **FAILED**: no authentic npm lockfile | `test-evidence/v41/npm-ci-offline.log` |
| `NODE_ENV=production npm run build` | **FAILED**: missing project packages/types (e.g. `@nestjs/common`, `pg`, `@types/node`) | `test-evidence/v41/full-build.log` |
| `npm test` | **FAILED**: missing `@nestjs/common` and `pg` prevents TS test import | `test-evidence/v41/npm-test.log` |
| v0.41 PostgreSQL two-session runner | **NOT RUN**: no installed `pg` package / disposable PostgreSQL database | A deliberate no-consent invocation was refused before import: `test-evidence/v41/concurrency-guard.log` |
| Two full API instances / authenticated browser tests | **NOT RUN** | See `V41_KALI_VALIDATION.md` |

**Environment:** Node 22.16.0, npm 10.9.2, global TypeScript; no project `node_modules`, no genuine `package-lock.json`, no local `psql`/Docker runtime, npm registry DNS unavailable (npm ping returned EAI_AGAIN). Checks run against the copied actual v0.40 source. No production records or databases were accessed.

## Test-first and regression observations

- CI source review found the old workflow only included offline verification through v0.35. It now includes every declared version through v0.41. `tools/ci-completeness-v41.cjs` dynamically checks future version additions and SQL contracts rather than hardcoding only a new end version.
- Negative tests verify that removal of the v0.40 SQL contract, omission of a hypothetical v0.42 check, `continue-on-error: true`, fallback `|| true`, replacing `npm ci` with `npm install`, unsafe DB URLs, and schema injection attempts are all rejected.
- The two-session contract was **authored and syntax checked but not executed**. Green policy tests do not constitute green PostgreSQL/concurrency tests. The script applies the exact existing migration 018 in a controlled test schema; no production schema updates were performed.
- The full historical suite succeeded **offline**, but many historical tests use mocks, source assertions or syntax compilers. The results do not establish deployability or real runtime integration.

## Release blockers and concrete next steps

1. On trusted connected Kali/Linux, generate a genuine reviewed npm lockfile and run `npm ci`, `npm test`, and the full API/web build without bypassing failures.
2. Execute migration, live test SQL contracts and the new two-session script on an authorized disposable local `_ci`/`_test` PostgreSQL/PostGIS database; preserve logs.
3. Run **two actual API servers**, shared-database redemption races, authenticated two-admin and recipient browser flows, real PDF download and Ed25519 verification against pinned public keys.
4. Validate HTTPS and proxy-level abuse protection, restore drills, operational alerts, signing key rotation/custody, independent security review and applicable Uganda data protection and professional-source rules.
5. Obtain real GitHub Actions execution evidence after an authentic lockfile is committed. **Static workflow verification is not a live CI run.**

**Verdict:** The v0.41 engineering work is an offline-verified development checkpoint. **Release approval withheld.** No change in legal authority: AssetTrust reports are private, non-official due-diligence evidence, not land ownership certificates or guaranteed title verification.
