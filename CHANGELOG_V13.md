# AssetTrust v0.13 — Integration Pipeline Stabilization

**Project:** AssetTrust — land and asset evidence verification
**Compiled by:** Aturinzire Hargreave
**Release type:** development checkpoint, **not production ready**

## Fixed
- The GitHub Actions workflow contained a fixed JWT string marked for replacement and an invalid-length document encryption key. The project startup policy also failed to recognize the phrase `replace-in-deployment` as a placeholder. Both problems are now fixed.
- CI now creates independent, cryptographically random JWT, authenticator-secret encryption, and document-vault encryption keys for every job. Key bytes are not embedded in repository history.
- CI now uses a local, purpose-named `assettrust_ci` database rather than an unrestricted generic database name.
- The live integration runner validates loopback origin, disposable database name, `CI=true`, `NODE_ENV=test`, explicit mutation consent, and matching test-instance identifiers **before** starting an API.
- Integration execution now supervises its backend child process, waits for the real DB/PostGIS readiness endpoint, executes the existing four HTTP suites, captures bounded redacted diagnostic logs if a suite fails, and attempts to clean up the child server.

## Added
- `tools/ci-security-preflight.cjs` — compiles and invokes the actual framework-independent startup configuration policy.
- `tools/ci-runner-policy.mjs` — small pure policy and readiness polling dependency boundary.
- `tools/ci-live-integration.mjs` — supervised CI-only runner for existing HTTP/PostgreSQL integration checks.
- `tools/tests-v13/*.test.*` — 20 TDD security and integration-runner tests.
- `npm run verify:v13` and `npm run test:e2e:ci`.
- V13 documentation and captured test results.

## Deliberately unchanged
- Existing React page structure and dark black/gold/green design; no new page was necessary for infrastructure-only work.
- Previous DDD domain policies, Clean Architecture dependency boundaries, PostgreSQL migrations, encryption key IDs, and business data formats.
- No official land-registry, payment-settlement, or blockchain integration is claimed.

## Verification limitations
- All available v0.3–v0.13 offline suites passed in this environment.
- `npm run build` stopped at missing `@types/node` because project packages are not installed.
- `npm test` stopped at missing NestJS and `pg` dependencies.
- PostgreSQL, Docker, and a full browser integration environment were not available. The GitHub Actions workflow has **not** been executed in this workspace.
