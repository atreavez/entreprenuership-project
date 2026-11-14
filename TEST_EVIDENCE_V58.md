# AssetTrust v0.58 - Test evidence

Recorded 11 November 2026. This report represents executed offline commands in the artifact workspace and explicitly separates unrun live tests.

## Offline results (executed)

| Test/check | Result | Record |
| --- | --- | --- |
| New v0.58 dependency-free security tests | **15/15 PASS** | `test-evidence/v58/logs/v58.log` |
| Historical/current version suites v0.03 through v0.58 | **56/56 PASS** | `test-evidence/v58/version-matrix.json` and per-suite logs in `test-evidence/v58/logs/` |
| Architecture regression | PASS | `test-evidence/v58/architecture.log` |
| TypeScript/TSX syntax-only scan | PASS: 104 source files, no syntax errors | `test-evidence/v58/syntax.log` |
| CI coverage/static integrity | PASS: 56 version checks, 26 PG contracts | `test-evidence/v58/ci-completeness.log` |
| GitHub Actions YAML and security policy | PASS | `test-evidence/v58/ci-yaml.log` |
| Vite/TypeScript source entry graph | PASS: 101 files, 283 relative imports checked | `test-evidence/v58/source-build-preflight.log` |
| Source high-confidence secret patterns | PASS: 2,536 files, zero matches | `test-evidence/v58/source-secret-scan.log` |
| Original SQL source migration fingerprints | PASS: 25/25 unchanged | `test-evidence/v58/release-preflight-blocked.log` |

The version suite logs were produced by invoking the repository's actual `npm run verify:vNN` commands individually. **Passing tests that mock or inspect database behavior are not proof that a real PostgreSQL runtime was exercised.**

## Blocked or unexecuted checks (recorded)

| Required release evidence | Result | Cause |
| --- | --- | --- |
| Genuine `npm ci` | **BLOCKED** | No authentic `package-lock.json`; `test-evidence/v58/npm-ci-blocked.log` |
| Full API and React compilation | **FAILED/BLOCKED** | Missing installed NestJS/Node dependency types; `test-evidence/v58/build-blocked.log` |
| v0.58 two-organization seeded restricted-login RLS | **NOT RUN** | No authorized disposable PostgreSQL or installed `pg`; safety guard refuses execution without prerequisites; `test-evidence/v58/live-test-blocked.log` |
| Supervised `--database` release | **BLOCKED before mutation** | Missing explicit database authorization and lockfile; `test-evidence/v58/supervised-database-blocked.log` |
| Release preflight | **NO-GO: 3/11** | Missing builds, deps, deployment config and other gates; `test-evidence/v58/release-preflight-blocked.log` |
| Real ClamAV / original Git history / full HTTP / Playwright / TLS / recovery drill / penetration testing | **NOT RUN/NOT VERIFIED** | Requires independent services/CI/Kali |

## New adversarial test contract

The new `tools/e2e-pg-runtime-tenant-isolation-v58.mjs` is deliberately **not simulated** when it is run with its required flags. It must create two distinct organizations and core records using a disposable database operator and verify actual row-level security through a second connection using `assettrust_v57_ci_runtime`. It checks no-scope reads; tenant-owned reads; cross-tenant updates and deletes returning zero; cross-tenant inserts rejected by RLS; transaction isolation reset; and cleanup on exit. The tests in `tools/tests-v58` check the contract's guards and integration into CI, not a running PostgreSQL instance.

**Production verdict remains NO-GO.** Run `V58_KALI_VALIDATION.md` in a trusted, isolated Kali environment and preserve actual live evidence before considering a pilot.
