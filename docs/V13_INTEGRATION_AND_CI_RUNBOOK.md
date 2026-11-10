# AssetTrust v0.13 — CI and Live Integration Runbook

Compiled by **Aturinzire Hargreave**.

## Purpose and engineering boundaries

The work hardens integration delivery rather than adding domain functionality. The deployment-security domain rule is pure TypeScript; the CI preflight invokes the real domain policy and the integration-runner policy remains framework-independent. NestJS, PostgreSQL, React, and external HTTP processes are adapters/execution environments, not the source of these rules. This preserves **DDD, TDD (RED → GREEN → REFACTOR), SOLID, Clean Architecture, and security by design**.

## A. Fresh Kali development clone

1. Use Node.js >=22.12, npm, PostgreSQL 17 with PostGIS, and Docker Compose or an equivalent test database.
2. Unzip the source and enter the `assettrust-v13` root.
3. Copy `.env.example` to `.env`. Generate *three distinct values* using `openssl rand -hex 32` and configure `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, and the `DOCUMENT_ENCRYPTION_KEYS` JSON entry. Do not reuse prior keys if upgrading a database that has encrypted documents.
4. On a new disposable development DB only, run:

```bash
npm install
npm run verify:v13
npm run smoke:offline
npm run verify:v12
npm run build
docker compose up -d postgres
npm run db:migrate
npm run db:check
npm run dev:api
```

5. Start the browser app in another terminal with `npm run dev:web` and navigate to `http://localhost:5173`.

Do **not** run fresh-database migrations directly against an older AssetTrust database. Follow `docs/V11_MIGRATION_AND_RELEASE.md` for a verified backup and baseline.

## B. GitHub Actions pipeline

`.github/workflows/ci.yml` runs on push and pull request. Its steps are:

1. Start the isolated PostGIS service (`assettrust_ci`).
2. Install dependencies (`npm install`; future release should lock this with a committed `package-lock.json` and `npm ci`).
3. Generate fresh independent secrets directly into `GITHUB_ENV`, **without printing them**.
4. Execute `node tools/ci-security-preflight.cjs`, which compiles and calls the application's real `validateRuntimeConfig` domain policy.
5. Run all offline domain, architecture, security, and syntax suites.
6. Compile NestJS and React.
7. Apply all migrations, rerun them to confirm idempotence, and check the migration ledger.
8. Start a supervised API, await `readyz` reporting ready PostGIS/schema, and execute the existing four localhost HTTP suites.

**The workflow is defined, not yet observed running.** A green GitHub workflow is needed before the release can advance.

## C. Why the CI mutation guard matters

The CI runner refuses to execute unless all of the following hold:

- `CI=true` and `NODE_ENV=test`.
- `ASSETTRUST_E2E_ALLOW_MUTATION=YES` is explicitly set.
- `ASSETTRUST_E2E_TARGET_ID` matches `ASSETTRUST_E2E_EXPECT_TARGET`.
- The PostgreSQL connection is loopback-only and points to `assettrust_ci` or `assettrust_test`.
- The HTTP API URL is a plain local origin; no credentials, query, or remote HTTPS host are allowed.
- The API `/api/v1/readyz` confirms both database and PostGIS readiness.
- Every individual HTTP smoke test also checks the returned server marker.

These are defense-in-depth checks, not a replacement for a disposable DB or an isolated CI runner.

## D. Reproducing the verified local checks

```bash
npm run verify:v13
npm run verify:v12
npm run verify:architecture
npm run verify:syntax
```

Complete offline regression commands: `smoke:offline`, `verify:v03`, `verify:v04`, `verify:architecture`, and `verify:v05` through `verify:v13`.

## E. Remaining deployment gates

- Install project packages from a trusted registry and commit a reviewed dependency lockfile.
- Successful `npm test` and `npm run build` for both apps.
- Green GitHub Actions pipeline using disposable PostGIS.
- Browser interaction tests for authentication, protected routes, document downloads, geospatial views, and permissions at desktop and mobile breakpoints.
- Backups/restores tested; audit logs independently monitored; cryptographic keys stored in a managed secret facility and rotated safely.
- External identity authorities, official registry access, payments, and blockchain anchors separately implemented and authorized.

**No source package should be deployed to serve real user land documents until these gates pass.**
