# AssetTrust v0.34 — Kali Linux Build, Migration and Test Guide

## 1. Preconditions

- Node.js 22.12+, npm, Docker Engine with Docker Compose or an independently installed PostgreSQL/PostGIS instance.
- Stable access to an npm package registry for **generating a real dependency lockfile**; this checkpoint does not fabricate one.
- A disposable test database, not a production or personal-data database.
- For existing databases: **verified backup**, original document encryption keys, and approved migration history before running anything that changes the schema.

## 2. Extract and install

```bash
cd ~/Downloads
unzip AssetTrust_v34_Report_Issuance_and_QR_Verification_Checkpoint.zip
cd assettrust-v34
npm install --package-lock-only
# Review and commit the authentic package-lock.json.
npm ci
npm run verify:v34
npm run verify:architecture
npm run verify:syntax
npm run build
```

The installation fetches `qrcode.react@^4.2.0` plus the existing frontend and backend dependencies. Review the lockfile and dependency graph; do not use a made-up or empty lockfile to bypass release gates.

## 3. Database validation (fresh development database)

```bash
cp .env.example .env
# Fill JWT_SECRET, MFA_ENCRYPTION_KEY and DOCUMENT_ENCRYPTION_KEYS with separate,
# securely generated values; set a disposable DATABASE_URL and WEB_ORIGIN.
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

For an **existing v0.33 database** that already has `assettrust_schema_migrations`, take a verified backup first, ensure previous migration checksums match, then run `npm run db:migrate` to append migration `014_report_issuance.sql` exactly once. Do NOT use `db:baseline` to skip the new migration. The new migration adds append-only report records and an authorization-protected proposal table.

## 4. Disposable PostgreSQL contract test (never production)

The test requires explicit authorization and a local database name accepted by `tools/pg-e2e-policy-v21.cjs`. It uses test-only UUIDs and rolls back fixtures.

```bash
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
# DATABASE_URL must point to localhost and a disposable CI/test database.
npm run test:pg:reports:v34
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

This is a database **contract test** of foreign keys, independent approval and immutable row triggers; it is not a full authenticated HTTP browser end-to-end test.

## 5. Run the application

```bash
npm run dev:api
# New terminal:
npm run dev:web
```

Use a test organization with **two separately authenticated organization administrators**, both having active MFA and a freshly verified step-up. Complete all verification case stages with independently accepted evidence and close the case. Under **Report Issuance**, have administrator A propose an issued evidence snapshot, then administrator B approve it. The browser can display a QR linking back to the same-origin public verification view.

Check that an unrecognized public reference returns 404, that a different organization cannot access the private report endpoints, that reopening the case or adding a dispute flags public verification as `UNDER_REVIEW`, and that a later approved supersession marks the older report `SUPERSEDED`.

## 6. Required production gates

- A successful `npm ci` using a reviewed authentic lockfile.
- A passing complete `npm run build`.
- PostgreSQL/PostGIS migrations, migration checksum/readiness verification, and successful disposable SQL contract test.
- Live API/browser tests covering MFA, two-person approval, record supersession, public verification, tenant isolation, and attack scenarios.
- Emergency administrative revocation/cancellation governance, external independent attestation and independent archival before real-client report issuance.
- A formal review of legal positioning and document templates; printed PDF and digitally signed files are **not** implemented by this checkpoint.

**v0.34 is a development checkpoint, NOT a production release.**
