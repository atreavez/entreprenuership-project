> **Latest development checkpoint — v0.21**: transaction-scoped live surveyor accreditation rechecks during parcel review, plus a guarded disposable PostgreSQL assertion runner and fail-closed TypeScript compilation. Read [v0.21 changelog](CHANGELOG_V21.md), [security design](docs/V21_SURVEYOR_AUTHORIZATION.md), [Kali guide](docs/V21_KALI_RUNBOOK.md), and [test evidence](docs/TEST_EVIDENCE_V21.md). **Production release remains blocked:** missing authentic npm lockfile, full build and real PostGIS/browser verification.

> **Latest development checkpoint — v0.20**: MFA downgrade authorization hardened; see [changelog](CHANGELOG_V20.md), [security/Kali guide](docs/V20_SECURITY_AND_KALI.md), and [test evidence](docs/TEST_EVIDENCE_V20.md). **Production release remains blocked** by missing authentic npm lockfile, unavailable full build, and outstanding live PostgreSQL tests.

# AssetTrust v0.18 — Identity Recovery Security

**Compiled by Aturinzire Hargreave**  
**Architecture:** DDD • TDD • SOLID • Clean Architecture • Security by Design  
**Release:** BLOCKED pending reproducible build and live integration tests.

This checkpoint fixes reuse of consumed MFA backup codes during account MFA removal. Run `npm run verify:v18` to execute the regression suite (five tests), then follow [v0.18 Kali and Security Guide](docs/V18_KALI_AND_SECURITY.md) and [Test Evidence](docs/TEST_EVIDENCE_V18.md). Existing frontend and backend code is preserved. **No live PostGIS test or successful full build has been demonstrated in this environment.**

---

# AssetTrust v0.17 — Build integrity and architectural boundaries

**Compiled by: Aturinzire Hargreave**  
**Standards:** DDD · TDD · SOLID · Clean Architecture · Security by Design  
**Release status:** BLOCKED pending a real `package-lock.json`, successful dependency installation, full builds and live integration tests.

Start with [v0.17 build guide](docs/V17_BUILD_INTEGRATION_RUNBOOK.md), [test evidence](docs/TEST_EVIDENCE_V17.md), and [changelog](CHANGELOG_V17.md). Run `npm run verify:v17` for the new offline checks; use `npm run release:gate:v17` to enforce a complete dependency graph. Existing React UI, API, PostGIS and mapping modules remain in the source.

---

# AssetTrust v0.15 — Safer live integration runner

This checkpoint extends v0.14 and preserves the existing React/NestJS/PostgreSQL/PostGIS modules and black/gold/green responsive designs. It adds a fresh per-run disposable API marker, loopback binding for test servers, strict preflight and tests against a real localhost HTTP server. **It has not passed a full app build or live database integration.**

**Start here:** `docs/V15_RUNBOOK.md` · `docs/TEST_EVIDENCE_V15.md` · `CHANGELOG_V15.md`.

# AssetTrust v0.13 — Integration Stability Checkpoint

**Compiled by Aturinzire Hargreave**  
**Engineering:** DDD · TDD · SOLID · Clean Architecture · Security by Design  
**Status:** Development checkpoint; **not production-ready**.

**What's changed in v0.13:** independent per-run CI secrets, corrected JWT placeholder rejection, real startup-policy preflight, isolated disposable PostGIS test database, supervised API integration runner, and 20 new security/CI tests. Earlier React UI and business workflows are preserved.

**Start here:** `docs/V13_INTEGRATION_AND_CI_RUNBOOK.md` · `docs/TEST_EVIDENCE_V13.md` · `docs/IMPLEMENTATION_STATUS_V13.md` · `CHANGELOG_V13.md`.

**Run offline checks:** `npm run verify:v13`. **Full API/Web build:** `npm install && npm run build` on a machine with registry access. **Do not run full integration scripts against production data.**

---

# AssetTrust v0.12 — Land & Asset Verification Platform

**Compiled by: Aturinzire Hargreave**  
**Architecture:** Domain-Driven Design • Test-Driven Development • SOLID • Clean Architecture • Security by Design

A Uganda-first land and asset verification evidence platform. This application does **not** replace the Uganda National Land Information System or provide authoritative proof of land title. Submitted boundaries and cryptographic hashes are never treated as legal ownership certificates.

## What's new in v0.12

This checkpoint introduces **fail-closed configuration validation**, prevents destructive HTTP tests from contacting unmarked servers, and adds 22 new offline RED → GREEN tests. Existing dashboard, verification, encrypted-vault and geospatial modules are preserved. No new UI screen was added because this milestone focuses on deployment and integration safety.

- [v0.12 Kali integration runbook](docs/KALI_LIVE_INTEGRATION_V12.md)
- [v0.12 test evidence and release decision](docs/TEST_EVIDENCE_V12.md)
- [v0.12 changelog](CHANGELOG_V12.md)

**Status:** Offline regressions pass; full npm build, PostgreSQL, browser flows and external integrations remain unverified. **Not production-ready.**

## Fresh local development setup

```bash
cp .env.example .env
# Set three independent secrets and a development DATABASE_URL (see .env.example).
docker compose up -d postgres
npm install
npm run verify:v11
npm run verify:v12
npm run db:migrate
npm run db:check
npm run build
npm run dev:api
# in another terminal:
npm run dev:web
```

UI: http://localhost:5173 • API liveness: http://localhost:4000/api/v1/healthz • API readiness: http://localhost:4000/api/v1/readyz

## Available packages

- `apps/api`: NestJS API, PostgreSQL/PostGIS adapters, encrypted document vault, trust and verification domains.
- `apps/web`: React responsive UI and live operational readiness view.
- `services/tiles`: locally hosted MBTiles raster service (synthetic demo tiles by default).
- `tools/migrations`: checksum-aware migration runner and policy.
- `tools/tests-v11`: offline tests for migration and schema readiness.
- `docs/`: architecture, security, migrations and test evidence.

## Validation status

Offline policy/domain tests and source-rendered mobile/desktop previews pass. **Full npm typecheck/build, live PostgreSQL and browser integration were not verified in the artifact creation environment.** See `docs/TEST_EVIDENCE_V11.md`.

## v0.14 integration checkpoint (7 November 2026)

To inspect the current source prerequisites without downloading anything, run `npm run preflight:v14`. The check lists missing packages and reports if a reproducible npm lockfile is absent. `npm run verify:v14` runs 10 offline policy tests for identity-bound CI readiness and build prerequisites. See [`docs/V14_INTEGRATION_READINESS.md`](docs/V14_INTEGRATION_READINESS.md) and `test-evidence/v14` for the release gate decision, reproducible tests and the recorded full-build blocker. **A successful offline test run does not mean the full application has built or been deployed.**

## v0.19 security checkpoint

**Compiled by Aturinzire Hargreave.** Login now performs an Argon2id verification for both unknown and existing emails to reduce account-enumeration timing differences. Run `npm run verify:v19`. This remains a development checkpoint: the authentic npm lockfile, full application build, and live PostgreSQL/browser integration gates have not passed. See `docs/V19_KALI_BUILD_AND_SECURITY.md` and `docs/TEST_EVIDENCE_V19.md`.

## v0.22 — professional reviewer authorization

This checkpoint prevents expired login sessions from authorizing professional accreditation attestations, reviewer-queue access or credential revocations after an earlier successful request guard. Run `npm run verify:v22` for the eight regression tests and read `docs/V22_KALI_LIVE_VALIDATION.md` before attempting disposable PostgreSQL integration tests. **Full build and live integration remain unverified.**
