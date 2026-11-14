# AssetTrust v0.61 — Kali Linux upgrade and live test runbook

## 1. Safe prerequisites

Use an extracted v0.61 directory, Node >=22.12, a trusted npm registry, PostgreSQL with PostGIS, `psql`, and a disposable **local** database named `assettrust_ci` or `assettrust_test`. Do not test using the production database or real land records. Keep operator and runtime database credentials separate. Copy this checkpoint to a new working branch/directory, preserving the original repository and backups. Inspect the code and dependencies before introducing any production data.

```bash
cd ~/Downloads/assettrust-v61   # adjust to the actual extracted project root
node --version
npm --version
npm run verify:v61
npm run verify:ci:v53
npm run verify:architecture
npm run verify:syntax
npm run security:scan:v43
npm run release:preflight:v51
```

The last command is expected to return **BLOCKED** before a genuine npm lockfile is created.

## 2. Bootstrap and inspect authentic dependencies

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
npm test
```

Review `package-lock.json` before committing it. If a command fails, save the unredacted error privately; do not paste tokens, `.env` files, database URLs or real passwords in chat. Do **not** substitute a generated/fake lockfile, suppress audit findings or skip test gates.

## 3. Apply migration 026 to a disposable database only

Before any production migration: take and **restore-test** a database backup, inspect existing RLS data policies, coordinate API deployment and run integration tests in staging. Applying RLS before deploying the v0.61 API code will break older unscoped audit queries.

Set private environment variables for the local disposable `assettrust_ci`/`assettrust_test` DB following the v0.60/v0.59 validation guides. Never place live credentials into shell history. The operator login must be able to apply migrations; the separate API login must have no SUPERUSER, BYPASSRLS, CREATEDB or CREATEROLE rights.

```bash
# Only after verifying DATABASE_URL points to your local DISPOSABLE database
npm run db:migrate
npm run db:check
# Optional read-only inspection:
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tools/sql/v61-audit-rls-readonly-audit.sql
```

The live test requires a disposable *fixture operator* with PostgreSQL superuser privileges **only for test fixture cleanup**. This operator is NEVER the API process login. Its use is blocked outside explicitly authorized local CI/test targets.

```bash
# Confirm every required environment value was privately configured:
# CI=true ; NODE_ENV=test
# ASSETTRUST_E2E_ALLOW_MUTATION=YES
# ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
# ASSETTRUST_V61_AUDIT_RLS_CONFIRM=YES
# DATABASE_URL points to a disposable local operator DB
# ASSETTRUST_RUNTIME_DATABASE_URL points to the same DB with restricted runtime login

npm run test:pg:runtime-role:v57
npm run test:pg:runtime-privileges:v60
npm run test:pg:audit-rls:v61
npm run test:pg:runtime-tenant-isolation:v58
npm run test:pg:runtime-tenant-crud:v59
```

The live audit test commits synthetic fixture records briefly so an independent connection can see them. It cleans them up normally, but a hard crash can leave synthetic rows; never run on a shared, production or irreplaceable database. On failure, stop and inspect/clean the disposable database before rerunning.

## 4. Full validation and release decision

Run `npm run release:plan:v51` and the supervised tests as documented in `V60_KALI_VALIDATION.md`, including two-API HTTP integration tests, ClamAV clean/malware checks, and Git-history scanning of the original clone. Confirm that every release stage genuinely ran. Do not declare production readiness until all gates pass, a least-privilege RLS review covers the **remaining** sensitive tables, and independent security review is complete.

**Status on checkpoint creation: NO-GO.** The live migration, separate-connection contract and full build are not verified in this build environment.
