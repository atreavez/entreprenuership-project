# AssetTrust v0.35 — Kali Linux Validation and Upgrade

This checkpoint is newer than the user's previously running v0.22 checkout. Do not overwrite a live checkout, reuse production secrets, or apply migrations without a verified backup. The ZIP contains source code; it does not include a fabricated `package-lock.json`.

## Unpack into a separate development folder

```bash
cd ~/Downloads
unzip AssetTrust_v35_Governed_Report_Withdrawal_Checkpoint.zip
cd assettrust-v35
node --version  # Node.js >=22.12
npm install --package-lock-only
# Audit package-lock.json and commit the genuine resolved lockfile.
npm ci
npm run verify:v35
npm run verify:architecture
npm run verify:syntax
npm run build
```

If install/build fails, collect the full error output. Do not bypass the release gate or create a placeholder lockfile.

## Database setup

**Fresh disposable test DB preferred.** PostgreSQL plus PostGIS must be installed before geospatial migration 007. `.env` requires separate strong, non-sample JWT/MFA/document encryption secrets and a disposable `DATABASE_URL`.

```bash
cp .env.example .env
# Set test-only secrets and DATABASE_URL in .env. Do not publish this file.
npm run db:migrate
npm run db:check
```

For a previously migrated v0.34 development database, verify backups, key material and migration checksums before applying **new migration 015**. Never `db:baseline` to skip migration 015. For a v0.22 checkout, apply all pending migrations in ledger order using the current migration tool and ensure compatibility with your existing data; do not simply copy SQL into a live database.

## Opt-in disposable PostgreSQL verification

```bash
# DATABASE_URL must target a localhost database with an approved *_ci or *_test name.
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
npm run test:pg:withdrawals:v35
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

These tests use synthetic identities and roll back one transaction. The policy deliberately refuses to connect otherwise. They are database-contract checks, not a live browser test.

## Two-administrator walkthrough

```bash
npm run dev:api
# New terminal:
npm run dev:web
```

Use two separately authenticated **current organization admins** with valid MFA, and an already issued non-official report. In the admin Report Issuance page, have admin A choose a report and submit a 20+ character withdrawal reason. Confirm its public QR shows UNDER_REVIEW (without the confidential reason) while the withdrawal request is pending. Log in as admin B (different account), review the confidential reason and approve. Open the QR reference again; it must show WITHDRAWN and a clear "do not rely" warning. Verify admin A cannot self-approve, outsiders cannot see the proposal, a rejected decision does not withdraw, and the original report remains intact. Inspect audit records.

**Do not conduct the walkthrough with real client records until live migration, build, penetration/security and data-protection checks pass.**
