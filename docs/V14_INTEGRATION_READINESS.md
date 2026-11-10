# AssetTrust v0.14 — Verified Test-Runner Identity and Build Preflight

**Compiled by Aturinzire Hargreave · 7 November 2026**

## Purpose

This is a targeted hardening checkpoint of the existing v0.13 application, not a claim of production readiness. It preserves the existing NestJS API, React interface, encrypted vault, DDD/TDD/Clean Architecture, SOLID policy boundaries, and security-by-design controls.

### Concrete changes

1. `tools/ci-runner-policy.mjs` provides `waitForOwnedApiReady()`, which checks that `/api/v1/healthz` identifies *the exact expected disposable server* before consulting `/api/v1/readyz`. A responding but incorrect server fails immediately; an unavailable server retries within a bounded period.
2. `tools/ci-live-integration.mjs` uses this identity-bound check before starting any suite that creates database records. Existing per-suite target checks remain in place as independent defense in depth.
3. `tools/preflight-policy-v14.cjs` is a pure, independently tested policy for Node version, dependency presence, and lockfile warnings. `tools/preflight-v14.cjs` scans local workspace dependencies without requiring a network connection.
4. The GitHub Actions workflow runs build prerequisite checks after dependency installation and runs the v0.14 offline suite with previous suites.
5. The release retains the previously developed API, map components, mobile/desktop pages, and migrations. No new database migration is required by v0.14.

## TDD evidence

- `test-evidence/v14/RED-v14.log` and `RED-v14-preflight.log`: tests initially fail because their new modules/functions are missing.
- `test-evidence/v14/GREEN-v14-all.log`: the 10 new policy tests pass.
- `test-evidence/v14/REGRESSION-v14.log`: full previous offline test scripts (`v03` through `v14`), architecture tests, syntax checks, and offline smoke tests pass.
- `test-evidence/v14/PREFLIGHT-v14.log`: the current container lacks application dependencies.
- `test-evidence/v14/FULL_BUILD_ATTEMPT.log`: `npm run build` fails at `TS2688: Cannot find type definition file for 'node'` before compiling the API or frontend.

## Reproducible Kali Linux workflow

For a **fresh, disposable development checkout only**:

```bash
unzip AssetTrust_v14_Integration_Contract_Checkpoint.zip
cd assettrust-v14
node --version
npm --version
npm install
npm run preflight:v14
npm run verify:v14
npm run verify:syntax
npm run verify:architecture
npm run build
```

`npm install` should generate a `package-lock.json` on a network-enabled machine. Review and commit that lockfile in the authorized repository. Only then switch CI to `npm ci` to make builds reproducible. Never commit `.env`, document encryption keys, MFA secrets, or private uploads.

For a **fresh test database** only, configure `.env` with different cryptographically random secrets and follow the earlier v0.11 migration runbook. After installing Docker/PostGIS locally:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
npm run dev:api
# In another terminal:
npm run dev:web
```

Run the E2E suite only against a disposable, locally marked test environment. The GitHub Actions pipeline generates the test marker and keys, then runs the supervised integration test driver. Do not run the test driver against existing client data.

## Required release gates (not passed here)

- Install the full dependency graph using a network-enabled runner and review the generated lockfile.
- Complete `npm run build`, API unit tests, and live PostgreSQL/PostGIS migrations.
- Execute the supervised API integration suite and verify startup identity controls against a real local test server.
- Run browser E2E tests on the compiled React application, including mobile viewport checks and session lifecycle.
- Verify encrypted uploads/downloads, organization isolation, professional approvals, and parcel access against a real database.
- Perform independent security review, backup/restore, key management, and deployment validation.

**Release decision: NO-GO for production.** The v0.14 additions pass offline checks, but the full application build and live integrations remain unverified.
