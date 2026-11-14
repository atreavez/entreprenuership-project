# AssetTrust v0.60 - Kali Linux Validation Guide

This file contains **explicit test-environment procedures**. Never point the commands at a production or shared PostgreSQL database. Do not send `.env` secrets, database URLs or private-key material into chat.

## 1. Build prerequisites

Extract the v0.60 ZIP and enter its root folder. Node.js 22.12+ and npm are required, alongside a trusted npm registry connection.

```bash
cd ~/Downloads/assettrust-v60
node --version
npm --version
npm run verify:v60
npm run verify:ci:v53
npm run build:source:v56
```

Only when a trusted network is available, review package sources and deliberately generate a **genuine** npm lockfile. Do not use a fake or hand-written lockfile.

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
npm test
```

Stop on errors. Inspect any lockfile changes, high-severity vulnerabilities or native-module install failures before continuing.

## 2. Use an exclusively disposable PostgreSQL target

Create or select a local PostgreSQL database named **assettrust_ci** or **assettrust_test**. Install PostGIS and run database migrations **only after** verifying the database host, name and backup requirements. Use operator credentials exclusively for migrations/fixture setup; use a separate restricted login for the API tests.

For CI-style scripts, the guard requires `CI=true`, `NODE_ENV=test`, `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES` and a loopback `DATABASE_URL` targeting the approved test database. Do not copy your real production `DATABASE_URL` into this environment.

### A fresh disposable database

Apply the expected migrations as the operator, then provision the restricted runtime account using the existing `tools/provision-ci-runtime-role-v57.mjs` instructions. The v0.60 provisioning code already revokes ledger mutation and audit rewrite privileges. In a local shell, use a **private 0600** file for `GITHUB_ENV` and never print that file or the generated URL.

### An existing disposable runtime role

If the v0.57 CI role already exists and the **test** database is trusted and confirmed, run the explicit non-destructive grant repair:

```bash
# Requires your already-configured, separate operator and restricted test DB URLs.
export CI=true NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
export ASSETTRUST_V60_REVOKE_CONFIRM=YES
npm run db:runtime-grants:v60
```

Do not run the repair on a production database. It refuses remote hosts and unapproved database names; it does not create accounts, rotate passwords or delete data.

## 3. Prove the resulting privileges and RLS behavior

With the same approved disposable URLs configured:

```bash
npm run test:pg:runtime-role:v57
npm run test:pg:runtime-privileges:v60
```

Verify PostgreSQL reports that the runtime role cannot `INSERT/UPDATE/DELETE` migration-ledger rows, cannot `UPDATE/DELETE` audit events, cannot create objects, and does not inherit elevated roles. Then, after the required explicit synthetic-fixture confirmations from the v0.59 guide, run:

```bash
npm run test:pg:runtime-tenant-isolation:v58
npm run test:pg:runtime-tenant-crud:v59
```

Run the existing two-API, HTTP, ClamAV and browser workflows after those checks. The supervised `release:full:v51` plan contains the new v0.60 privilege audit **before** fixture mutation.

## 4. Complete security evidence

Run the original-repository history scan against your real Git clone, the ClamAV live check, release evidence review, and authenticated browser workflows. Protect test logs and any environment output files because credentials may be present. Review results manually and maintain **NO-GO** unless the complete release checklist is independently validated.

Missing lockfile, failing build, PostgreSQL service errors, malware-scanner absence, privilege-audit failure or unsupported tenant queries must never be described as passed tests.
