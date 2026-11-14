# AssetTrust v0.42 — Disposable dual-API release validation (11 November 2026)

**Status: development checkpoint; production deployment blocked.** Based on the actual v0.41 release engineering checkpoint. This milestone adds executable test infrastructure, not new legal title-verification capabilities.

## Changes

- Added `tools/two-api-policy-v42.cjs`: fail-closed policy for a strictly local `assettrust_ci` or `assettrust_test` PostgreSQL target, explicit CI/test/authorization flags, owned server identity marker, two distinct nonprivileged ports, and a no-secret-in-URL negative recipient probe.
- Added `tools/e2e-two-api-v42.mjs`: supervises **two independent compiled NestJS API processes** using the **same disposable DB URL** on distinct loopback ports; creates distinct high-entropy process identity markers, waits for each owned `/healthz` and `/readyz` response, asserts both reject unknown recipient credentials with HTTP 404 and `no-store`, terminates only its own spawned children, and emits a minimal result summary without credentials.
- Added `tools/run-v42-disposable-validation.sh`: refuses unsafe target before `npm ci`, migration, or HTTP; requires a reviewed genuine lockfile; runs all version suites, API/web build, migration and two-session PostgreSQL contract, then the two-API smoke. This script is intended to be executed only against a newly provisioned disposable local database.
- Added `verify:v42`, `test:e2e:two-api:v42`, and `run:disposable:v42` package scripts; connected two-API contract to GitHub Actions with explicit authorization.
- Extended `ci-completeness-v41.cjs` to detect a missing two-API script or authorization flag. Adapted historical v0.41 test assertions to allow forward-only version expansion while still testing missing future suites.
- Advanced root/API/web version identifiers and API health response to v0.42.0. No new SQL migrations; existing 18 migration fingerprints unchanged.

## Validation limits

New automated tests cover refusal of unsafe environments, ports, origin, malformed credentials probe contracts, missing CI gates and missing permission for execution. Historical offline checks still pass. **Two real API processes did not run in the artifact-generation environment:** no authentic `package-lock.json`, no installed NestJS/pg packages, and no local PostgreSQL/Docker services. The runner is real executable source, not a completed live-integration result.

The two-server smoke does **not** test valid approved shares, cross-node concurrent redemptions, authenticated admin browser journeys, or production reverse-proxy rate limiting; these remain release blockers. Do not use synthetic data as proof of actual registry access. Reports are non-official due-diligence evidence only.
