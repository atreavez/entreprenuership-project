# AssetTrust v0.11 — Release-readiness & migration integrity checkpoint

Date: 7 November 2026  
Compiled by: Aturinzire Hargreave

## Purpose
This checkpoint focuses on making the previously implemented backend safer to deploy. It deliberately does **not** add claims of legal verification, government integration or production readiness.

## Implemented

1. Replaced unsafe replay-on-every-run SQL migration launcher with a standalone, checksum-aware PostgreSQL migration CLI.
2. Added an explicit ledger (`assettrust_schema_migrations`) with file-name and SHA-256 fingerprints, one transaction per migration, and a PostgreSQL advisory lock held across the run.
3. Introduced separate `db:migrate`, `db:check` and tightly guarded `db:baseline` commands.
4. Prevented an existing v0.10 database from being silently reinitialized or treated as a fresh installation. Baselining requires a verified backup and schema checks.
5. Added pure, framework-independent schema-readiness policy in the platform domain, and an infrastructure probe for PostgreSQL/PostGIS.
6. Made the NestJS API refuse to listen when its database schema is unavailable, incomplete, or altered from the expected migration fingerprints.
7. Added `/api/v1/readyz` readiness endpoint, separate from `/api/v1/healthz` liveness.
8. Added a responsive **Deployment Readiness** React screen: live readiness checks, integration posture, and non-negotiable release gates.
9. Extended CI to run v0.11 tests, apply migrations twice, verify fingerprints, and wait for `readyz` before executing API smoke tests.
10. Updated an older v0.7 architecture test to recognize the reviewed v0.11 migration runner without removing its existing encryption assertions.

## Validation completed here

- v0.11: 18 tests passed, covering migration plans, checksum drift, rollback, idempotence, legacy upgrade safeguards, and schema readiness.
- All v0.3–v0.10 **offline** regression suites passed after the migration-test update.
- 53 TS/TSX files passed syntax transpilation (not a full typecheck).
- Pure schema-readiness domain TypeScript compiled with `tsc --strict`.
- The Deployment Readiness UI rendered in source-based desktop/mobile previews with no horizontal overflow at 1440px and 390px.

## Not verified / not implemented

- The full NestJS and React production build is **not verified** here because npm dependencies (including `@types/node`) are unavailable in the execution environment.
- Live PostgreSQL/PostGIS migrations, browser-based MapLibre interactions, full authentication/document HTTP workflows and pen-testing remain unverified.
- Real Uganda basemap provisioning, official government land registry connectors, production payment gateways, and independently notarized blockchain receipts remain separate future tasks.

## Upgrade warning

Existing databases from v0.10 lack the new schema migration ledger. **Do not run `db:migrate` against such a database until you have followed `docs/V11_MIGRATION_AND_RELEASE.md`.** The runner rejects this case by default to avoid accidental corruption. Back up and verify restoration before manual baseline.
