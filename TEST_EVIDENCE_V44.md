# AssetTrust v0.44 - Executed Test Evidence and Release Decision

**Date:** 11 November 2026  
**Decision:** **NO-GO for production; offline-tested security development checkpoint**.

## Proven offline checks

| Verification | Result | Evidence |
|---|---|---|
| New v0.44 password recovery tests | **16/16 PASS** | `test-evidence/v44/verify-v44-final.log` |
| All version commands, v0.03 through v0.44 | **42/42 PASS** | `test-evidence/v44/regression-results.json` and `verify-vNN.log` |
| DDD/Clean Architecture policy checks | **PASS** | `test-evidence/v44/architecture.log` |
| TypeScript/TSX syntax transpilation | **PASS, 98 files / 0 syntax diagnostics** | `test-evidence/v44/syntax.log` |
| CI suite/completeness contract | **PASS; 42 version checks, 18 declared PostgreSQL contracts** | `test-evidence/v44/ci-coverage.log` |
| SQL source/manifests | **19/19 byte-for-byte SHA-256 matches** | Source check and `tools/release-readiness-v41.cjs` |
| Current working-tree secret scanner | **PASS: 0 pattern matches across 1,604 source/text files** | `test-evidence/v44/source-secret-scan.log` |
| Password reset domain and relay behavior | **PASS: positive and negative mocked tests** | `tools/tests-v44/password-reset*.test.cjs` |
| Read-only deployment preflight | **BLOCKED; 3/11 prerequisites present** | `test-evidence/v44/preflight.log` |
| Mandatory security finalization gate | **BLOCKED** | `test-evidence/v44/release-gate.log` |
| `npm ci` and vulnerability audit | **BLOCKED (genuine npm lockfile absent)** | `test-evidence/v44/npm-ci.log`, `npm-audit.log` |

## Test-driven progression

The v0.44 tests were first run before new modules were written, producing expected RED failures. The suite was then brought GREEN after implementation. Regression run one had 41/42 successful commands: an older v0.41 *future-version omission fixture* expected `verify:v44` to be absent after it became a real check. That test was corrected to test `verify:v45` as the future missing suite, and the complete subsequent 42/42 regression run passed. This change does not weaken CI completeness checks.

## Coverage details

Actual domain test code checks token generation, token strictness, keyed email pseudonyms, relay fail-closed settings, strict web-origin matching, reset SQL migration integrity, endpoint contracts, browser token handling, service replay and invalidation, normal/unknown account response consistency, per-account throttling, relay failure invalidation, suspended accounts, weak passwords, old password reuse, session and challenge revocation, tenant audit operation calls, and HTTPS adapter behavior.

The database service tests used an in-memory mocked query/transaction adapter and stub Argon2/delivery. Their success is not a substitute for running PostgreSQL against the real NestJS server. The real relay has not been connected. The v0.44 PostgreSQL contract test exists but was **not executed**; it requires an explicitly authorized loopback disposable database with the new schema.

## Production blockers

- No reviewed `package-lock.json`; no successful `npm ci`, `npm test`, full API/Web build, current `npm audit`, dependency pruning or SBOM.
- No live PostgreSQL migration 019 execution or verified transactional replay/concurrency testing.
- No real HTTPS email relay or proof of delivery; reset remains unavailable unless valid server-side settings are configured.
- No end-to-end automated browser evidence for token fragments, cookies, CSRF, MFA or multi-instance sessions.
- No complete Git history in this checkpoint; no historical secrets scan or actual provider key rotations.
- No deployed infrastructure control verification (TLS/HSTS, host firewall/SSH, backups/restore, RLS/tenant least privilege, upload malware scanning or full server-authoritative payment checks).

## Verdict

**NO-GO** until all critical/high release blockers are addressed and independently verified. The permanent cross-project `SECURITY_FINALIZATION_STANDARD.md` applies to this and every other project; neither green offline tests nor source-only checks certify the application as secure from attackers.
