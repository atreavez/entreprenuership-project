# AssetTrust v0.39 — Kali Linux setup, migration and verification

**Checkpoint only — do not deploy production.** Back up the existing database, preserve encryption/signing keys, and verify the prior v0.38 migration ledger before migration. Do **not** overwrite the existing running directory or use `db:baseline` to skip new migrations.

## 1. Safe extraction and dependency installation

```bash
cd ~/Downloads
unzip -q AssetTrust_v39_Confidential_Recipient_Sharing_Checkpoint.zip
cd assettrust-v39
node --version             # Node 22.12+ required
npm --version
npm install --package-lock-only    # Requires registry access; inspect the real lockfile
# Review package-lock.json and npm audit results, commit an authentic lockfile.
npm ci
```

The archive does **not** contain a fabricated dependency lockfile. If the registry is unavailable or `npm ci` fails, stop; do not substitute an empty/handwritten lockfile. Do not embed `node_modules` or environment secrets in a source archive.

## 2. Validate source and migrations offline

```bash
npm run verify:v39
npm run verify:v38
npm run verify:architecture
npm run verify:syntax
node -e "const p=require('./tools/migrations/plan.cjs').buildPlan();console.log('Migration count:',p.length,'Latest:',p.at(-1).filename)"
```

Expected latest migration: `017_report_recipient_shares.sql`. These offline tests do **not** establish working live API, migrations, or production build.

## 3. Database backup and forward migration

On an **existing v0.38** instance only after a verified backup and approved maintenance window:

```bash
# Back up the intended database; protect the resulting file as confidential.
pg_dump --format=custom --file="$HOME/assettrust-before-v39.backup" "$DATABASE_URL"
# Keep copies of the existing DOCUMENT_ENCRYPTION_KEYS, MFA_ENCRYPTION_KEY
# and report signing private keys in your existing secured secrets storage.
# Verify the backup using pg_restore --list and an actual restore exercise.
npm run db:migrate
npm run db:check
```

`db:migrate` must append `017_report_recipient_shares.sql` to the existing 16 migrations exactly once. If the ledger fails checksum verification, STOP and reconcile the database; do not edit old SQL files, delete ledger rows or call `db:baseline` as a shortcut.

## 4. Test the migration on a disposable LOCAL database (never real user data)

Provision a local PostgreSQL/PostGIS database with a safe name ending `_test` or `_ci`, and run all migrations there first. Then:

```bash
export NODE_ENV=test
export DATABASE_URL='postgresql://testuser:yourpassword@127.0.0.1:5432/assettrust_ci'
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
npm run test:pg:recipient:v39
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

The script validates target and local host **before** connecting. It opens a single transaction, inserts fictional fixtures, checks tenant FKs, dual-control, immutable credential commitments and redemption ledger, and rolls everything back. Requires the real `pg` dependency and a fully migrated disposable database. It does **not** simulate a whole browser-to-server HTTP session.

## 5. Build and interactive verification

```bash
npm run build
npm run dev:api
# Separate terminal, same source directory:
npm run dev:web
```

1. Log in with **two distinct active organization administrators**. Enroll MFA and complete fresh step-up for each.
2. Close a fictional verification case with required independently reviewed evidence, independently issue its report, select that issued report in **Report Issuance → Confidential recipient sharing**.
3. Admin A proposes a share for a recipient, expiry and maximum redemptions. Copy the Share ID, token and access code. Credentials are displayed only once; deliver token and code through *separate trusted channels*.
4. Verify the share is still inaccessible while pending. Admin A cannot approve; Admin B separately approves with fresh MFA.
5. Open `http://localhost:5173/#receive/report` in a new private browser, enter Share ID and both credentials. Confirm both PDF and `.receipt.json` downloads; verify the exact PDF bytes using `npm run report:verify-pdf:v37` with a trusted pinned issuer key (see v0.37 guide).
6. Test wrong token, wrong access code, expired window, exhausted count, revoked grant, cross-tenant operations, and a report newly withdrawn or put under review. All must fail closed.
7. Review admin **redemption history**. It records a server-side successful response, not confirmed end-user storage. Check network requests never put secrets in query strings and that the server returns `Cache-Control: no-store`.

## 6. Production gates (not yet passed)

- Authentic dependency lockfile, `npm ci`, full TypeScript/API build and Vite frontend build.
- Live forward migration and integration tests on disposable and staging PostgreSQL/PostGIS.
- Authenticated two-admin browser checks, concurrency/load tests, threat modeling and independent security review.
- TLS at reverse proxy; strict no-store; error/body logging redaction; shared rate limits for multiple API replicas; secure dual-channel delivery; key rotation and independent public-key trust.
- Recipient proof of identity and lawful disclosure review; backup/restore and operational alert drills.

If your current Kali installation is still v0.22, **do not jump blindly from its database to v0.39**. First reconcile its full migration history and test an upgrade on a disposable copy of the database with existing encryption keys preserved.
