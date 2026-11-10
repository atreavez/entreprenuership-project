# AssetTrust v0.11 — Migration, integration & release runbook

**Compiled by:** Aturinzire Hargreave  
**Architecture:** DDD · TDD · SOLID · Clean Architecture · Security by Design

## 1. Why migration integrity matters

Older checkpoints replayed every SQL file each time the migration command ran. Some statements were idempotent, but the process had no authoritative record of which scripts had executed or whether a historical file had been edited. An app processing identity and land evidence should never guess the database revision.

v0.11 creates a ledger of file name and SHA-256 digest, serializes migrations with a PostgreSQL advisory lock, and commits each migration and its ledger record together. Unknown migrations, changed checksums, missing revisions and partially applied histories are rejected.

The SQL files 001–007 have been retained **unchanged**. Transaction wrappers in existing SQL files are recognized and removed in memory so the new runner can keep each script's SQL and ledger INSERT within one transaction.

## 2. Fresh development install (empty AssetTrust database)

Requirements: Kali/Linux or Windows with Node.js 22+, npm, PostgreSQL 17 with PostGIS 3.5 (the project Docker Compose image includes these), Python 3 for the map service, and optionally Docker Compose. The following commands are meant for a **fresh development database**, not an existing installation.

```bash
cp .env.example .env
# Set DATABASE_URL; separately generate JWT_SECRET, MFA_ENCRYPTION_KEY, and DOCUMENT_ENCRYPTION_KEYS.
# Never commit .env or reuse the same secret for multiple purposes.
docker compose up -d postgres
npm install
npm run verify:v11
npm run db:migrate
npm run db:check
npm run build
npm run dev:api
# separate terminal
npm run dev:web
```

Check `http://localhost:4000/api/v1/healthz` for process liveness and `http://localhost:4000/api/v1/readyz` for schema readiness. Do not use `healthz` to decide whether to direct production traffic. On live startup the API fails closed if readiness fails.

## 3. Existing v0.10 database: manual controlled upgrade

**STOP before running `npm run db:migrate`.** The v0.10 schema does not have the new `assettrust_schema_migrations` ledger. The tool refuses to run a fresh migration over an existing `organizations` table without a ledger.

1. Stop application writes and take a full PostgreSQL dump, retaining role and extension information. Keep encryption keys and private documents **separately** with protected backups.
2. Restore the dump to a **separate disposable database**. Confirm row counts, the existence of PostGIS, documents' encrypted blob files, and that important case/tenant data can be read correctly. Record the backup file name and restore evidence.
3. Confirm all expected historical SQL changes are present; run the operator's own schema/constraint review. The baseline command performs **minimal structural checks** for tables, critical columns, and PostGIS but does not prove that every constraint or row is correct.
4. Run the following only with a verified restore and after organizational approval:

```bash
ASSETTRUST_BASELINE_LEGACY_SCHEMA=YES \
ASSETTRUST_BACKUP_CONFIRMED=YES \
npm run db:baseline
npm run db:check
```

The baseline command records the reviewed historical migration fingerprints **without re-executing** the seven old SQL scripts. These flags acknowledge that the operator completed the backup and review; the program cannot independently verify that a backup is restorable. Never run the baseline on a fresh database or to silence a mismatch after an unexpected schema change.

5. Start the v0.11 API in a **staging** environment and run smoke tests before promoting any changes.

## 4. Migration commands

| Command | Meaning |
| --- | --- |
| `npm run db:migrate` | Apply pending reviewed SQL on a fresh or already-ledgered database. |
| `npm run db:check` | Read-only check that all migration ledger entries match the shipped files. |
| `npm run db:baseline` | Explicit operator-controlled ledger creation for a previously reviewed v0.10 database; never silently run. |
| `npm run verify:v11` | Offline tests for policy, migration engine simulation, and pure schema-readiness policy. |

`npm run db:migrate --workspace apps/api` remains supported. Running `apps/api/src/migrate.ts` directly is intentionally disabled because it bypasses the migration ledger.

## 5. Readiness contract

- `GET /api/v1/healthz`: returns service liveness without asserting DB state.
- `GET /api/v1/readyz`: returns HTTP 200 only when PostGIS, the required tables and the expected seven ledger checksums are present; otherwise returns 503.
- The API checks the same contract **before listening**. Readiness is a schema gate, not proof of successful role authorization, official registry access, backups or payment handling.
- The React `Deployment Readiness` view shows the observed API status and known outstanding release gates. A design preview always reports `NOT TESTED`.

## 6. Acceptance gates for live staging

Run on an **isolated staging database** with disposable test organizations, not with customer data:

```bash
npm run smoke:offline
npm run verify:v03
npm run verify:v04
npm run verify:architecture
npm run verify:v05
npm run verify:v06
npm run verify:v07
npm run verify:v08
npm run verify:v09
npm run verify:v10
npm run verify:v11
npm run verify:syntax
npm test
npm run build
npm run db:migrate
npm run db:migrate             # expected idempotent second invocation
npm run db:check
```

Start the NestJS API and React app. Validate `readyz` returns HTTP 200 and `healthz` returns 200; disconnect PostgreSQL and confirm readiness fails; restore the connection and confirm readiness returns. Perform the provided HTTP smoke scripts using the documented explicit mutation flag only against a disposable staging tenant. Verify login/session rotation, MFA, tenant isolation, independent professional reviews, evidence gating, encrypted file upload/download, geospatial claims and overlap visibility. Exercise the real MapLibre runtime with self-hosted tiles (the included synthetic tile set is not real geography).

## 7. Mandatory security review before production

- Threat model and authorization matrix review; test cross-tenant and cross-asset isolation for every endpoint.
- Restore drill for PostgreSQL **and** encrypted blob storage; ensure persistent keys can decrypt historical files.
- CSP, secure cookie configuration, XSS/CSRF and rate limiting behind the deployed reverse proxy.
- Secrets management, key rotation, TLS/HSTS and trusted reverse proxy configuration.
- Authenticated audit log review and independent audit anchoring design (not present in v0.11).
- Approved professional accreditation procedures and explicit legal disclaimers.
- Government integration and payment settlement require separate authorizations and production acceptance tests.

## 8. Known constraints

The current checkpoint has **not** passed a complete local npm build or actual PostgreSQL integration in this sandbox. Missing dependencies and Docker/PostgreSQL services prevented those tests here. No production deployment, official registry API, blockchain transaction or payment settlement was performed.
