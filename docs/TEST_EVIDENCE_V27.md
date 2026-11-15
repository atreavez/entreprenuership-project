# AssetTrust v0.27 — Test Evidence and Release Verdict

**Compiled by Aturinzire Hargreave** • **Evidence date:** 10 November 2026

## Scope of delivered code

Privileged co-administrator invitations, mandatory MFA onboarding and enforcement, one-time invitation tokens stored as SHA-256 hashes (raw tokens are not stored), revocation/audit, acceptance safety, React team controls, schema migration 008, a disposable PostgreSQL authorization test, and CI updates. The full pre-existing application code and screens are retained.

## Executed verification

| Item | Recorded result | Evidence |
|---|---|---|
| v0.27 focused security tests | **19 passed / 0 failed** | `test-evidence/v27/verify-v27-final.log` |
| Overall offline regression commands | **28 passed / 28 run** | `test-evidence/v27/regression-results.json` and individual command logs |
| v0.11 migration/readiness tests | **18 passed** after adding an eighth append-only migration | `regression-npm-run-verify_v11.log` |
| TypeScript / TSX syntax scan | **60 files, no syntax diagnostics** | `regression-npm-run-verify_syntax.log` |
| Clean Architecture checks | **passed** | `regression-npm-run-verify_architecture.log` |
| CI configuration parsing | **parsed** with integration job | CI workflow source; local YAML parsing check |
| Source-based desktop + mobile previews | **1440px and 390px; no horizontal overflow** | `test-evidence/v27/layout-check.log`, `screenshots/v27-coadmin-*.png` |
| New PostgreSQL test script | **syntax checked**; refuses unauthorized execution | `tools/e2e-pg-coadmin-v27.mjs`, `test-evidence/v27/postgres-safety-gate.log` |
| Full application build | **failed**; missing NestJS, Node type definitions, and other npm packages | `test-evidence/v27/full-build-attempt.log` |
| Authentic npm dependency lockfile | **missing**; release gate correctly failed | `test-evidence/v27/release-gate-attempt.log` |
| Actual PostgreSQL/PostGIS test | **not executed** (no service/dependencies) | Runbook gives disposable-database procedure |
| Full React/NestJS browser E2E | **not executed** | Requires successful build and live API |

The 19 new tests exercise the actual transpiled TeamService, AuthGuard and infrastructure policy code using controlled test doubles (plus framework-independent domain policy). They check a new administrator cannot access records before MFA, one-use/expiry/revocation, issuer role/MFA checks, ordinary invitation non-escalation, current-session authorization, sponsor downgrade, required-MFA non-disable, and duplicate pending invitation rejection. These **are not real HTTP/database tests**.

The v0.11 migration-policy test had historical counts hardcoded for 7 migrations. It now expects 8; all seven historical migration file fingerprints remain unchanged, and the new file is appended with its own SHA-256 entry. The v0.18–v0.20 regression harnesses were adapted for the new pure policy import and the users.admin_mfa_required schema check, without removing their original assertions.

## Build and release disposition

The project still has no npm-generated and reviewed `package-lock.json`. `npm ci` is therefore not available for a reproducible build. `npm run build` failed at unresolved NestJS and Node type definitions; it did **not** verify the complete API or React compilation. The project was not connected to PostgreSQL or to a live browser in this run.

**Verdict: v0.27 is complete as an offline security / UI checkpoint; PRODUCTION RELEASE NOT APPROVED.** Live TypeScript compilation, authentic lockfile, actual migration and SQL behavior, administrator MFA onboarding through HTTP, final-review separation of duties, document encryption, geo operations, and full browser tests remain release gates.

Do not use completed AssetTrust verification workflows, audit hash chains, or source code as evidence that land ownership has been legally established or officially registered.
