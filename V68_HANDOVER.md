# AssetTrust v0.68 — Engineering Handover

**Checkpoint:** 0.68.0  
**Date:** 12 November 2026  
**Base:** v0.67 Readiness Concurrency and Admin Integrity checkpoint  
**Classification:** Source, test, and controlled build-acceptance milestone; **NOT** a successful live application build or security certification.

## Goal

Break the cycle of declaring progress from isolated source tests when the full application cannot yet be compiled, deployed, or validated against real PostgreSQL. The v0.68 change provides one explicit, auditable build acceptance sequence for a trusted connected Kali developer machine and rejects stale or tampered build artifacts.

## Delivered source changes

- `tools/build-acceptance-v68.cjs`: dependency-free CLI with `--plan`, `--inspect`, `--verify-artifacts`, and supervised `--run` modes.
- `--inspect`: checks all workspace versions, Node >=22.12, 27 pinned SQL file checksums, Vite import graph, and authentic lockfile policy. Flags missing original Git history separately as a later release concern.
- `--run`: requires `ASSETTRUST_V68_BUILD_CONFIRM=YES`, denies `NODE_ENV=production`, and will not execute any npm subprocess unless preconditions pass. It performs, in order, lockfile check, `npm ci`, high-severity production dependency audit, both builds, built-artifact checks, and v0.68 tests. It stops at the first failed step.
- Credential hygiene: the child process environment removes known secret, database URL, cloud credential and authentication variable names; bounded command output is never shown in CLI summaries. A redacted failure excerpt is stored only in a private `0600` local report.
- Artifact provenance: built API and web entries must be present, non-empty, regular non-symlink files with recent modification timestamps after compilation. SHA-256 hashes of both are captured. Lockfile and root manifest checksums must remain unchanged throughout all build steps.
- Existing post-build browser safety scanner remains mandatory; it examines web references and forbids obvious server-side secret markers.
- `tools/tests-v68/build-acceptance-v68.test.cjs`: 25 tests covering non-production authorization, missing prerequisites, stale/missing/symlinked artifacts, tampered lockfiles, partial failures, credential scrubbing, evidence permissions and CI step ordering.
- `package.json`, `apps/api/package.json`, `apps/web/package.json`: version raised to `0.68.0` and new npm scripts registered.
- `.github/workflows/ci.yml`: exercises v0.68 tests after dependency installation and validates compiled output following the existing full build.

No PostgreSQL migration, row-level security policy, auth flow, tenant isolation boundary, or business-domain behavior was intentionally changed in this milestone. All **27** checked-in SQL migration files were byte-for-byte identical to v0.67.

## Verified in this execution environment

- `npm run verify:v68`: **25/25 PASS**.
- Individual `npm run verify:v41` to `npm run verify:v68`: **28/28 version-suite commands PASS**. These do not constitute 28 end-to-end integrations.
- `npm run verify:architecture`: **PASS**.
- `npm run verify:syntax`: **PASS**.
- `npm run build:source:v56`: **PASS**.
- `npm run verify:ci:v53`: **PASS**.
- `npm run security:scan:v43`: **PASS**; no high-confidence secret matches among 3,073 current-source files (does **not** cover original Git history).
- `npm run build:acceptance:inspect:v68`: correctly **BLOCKED** on absent lockfile; confirmed versions and 27 migration hashes.

## Still blocked or unverified

- The registry could not be contacted (`EAI_AGAIN registry.npmjs.org`), so an authentic lockfile could not be generated and dependencies could not be installed.
- `npm run build`: **FAILED/BLOCKED** with missing `@nestjs/common`, `pg`, `@types/node`, and other dependency/type definitions. These errors must be reproduced *after* a genuine `npm ci` before concluding there are source-level TypeScript errors.
- `npm run release:preflight:v51`: **BLOCKED** on missing authentic lockfile.
- No live PostgreSQL/PostGIS server, ClamAV, real authenticated browser session, two-instance HTTP acceptance, Git-history secret scan, backup/restore test, TLS validation, or adversarial security audit was performed here.

**Production release decision: NO-GO.** Do not substitute tests with mocked subprocesses for genuine package installation, real database operations, or a production security review.

## Next action

Use `V68_KALI_VALIDATION.md` on the existing trusted Kali clone to create/review an authentic lockfile (only when absent), run the supervised build acceptance tool, and preserve its private redacted first-failure evidence. Remediate the **actual** first failing command before increasing the platform's claimed completion percentage. Once real builds pass, follow the v0.57–v0.67 guarded disposable PostgreSQL, two-API, authentication, admin UI, and deployment tests.
