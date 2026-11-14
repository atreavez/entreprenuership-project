# AssetTrust v0.25 — Kali Linux build and integration runbook

**This runbook is intended for a disposable development database, not production data.**

## 1. Extract and install dependencies

```bash
cd ~/Downloads
unzip AssetTrust_v25_Current_Workflow_Authorization_Checkpoint.zip
cd assettrust-v25
node --version
npm --version
npm install
npm ci
```

`npm install` must run successfully on an internet-connected system; it generates the authentic npm lockfile. Review and commit the file to source control. If `npm install` fails, stop rather than inventing a lockfile. Do not restore placeholder secrets in a production deployment.

## 2. Run offline and full-build checks

```bash
npm run verify:v25
npm run verify:v24
npm run verify:v04
npm run verify:architecture
npm run verify:syntax
npm run release:gate:v17
npm run build
```

The isolated v0.25 checks do not require PostgreSQL, but the full build requires all package dependencies. The full build must succeed before continuing.

## 3. Fresh disposable PostGIS database

Follow the application's `.env.example` and the existing v0.11 migration-baseline documentation. **Never baseline or rerun migrations on an existing database without a verified backup.** For a fresh local test DB, start PostGIS with `docker compose up -d postgres` if your Docker Compose configuration and environment match the project, then run:

```bash
npm run db:migrate
npm run db:check
```

Confirm the database name ends in `_ci` or `_test`, it is hosted on loopback, contains no real client data, and `NODE_ENV=test`. Do not use this procedure with existing records.

## 4. Live authorization check (rollback only)

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
# Set DATABASE_URL to your disposable, localhost-only PostgreSQL database.
npm run test:pg:workflow:v25
```

This command writes throwaway fixture rows inside one PostgreSQL transaction and rolls them back. It checks professional accreditation expiry/revocation and current roles when reviewing or assigning cases. The script refuses to run without the explicit authorization and a safe disposable database target. If it fails, keep the detailed output and **do not assume the authorization workflow is proven**.

## 5. Release criteria

A release requires an authentic lockfile, `npm ci`, a successful API/React build, fresh-schema and migration checks, the disposable PostgreSQL tests, actual HTTP/E2E tests for the review and assignment endpoints, independent security review, and documented backup/recovery procedures.

OpenAPI/UI success and local map preview imagery are not evidence of a government land-title certification. Official Uganda land registry integration and map licensing must be verified separately.
