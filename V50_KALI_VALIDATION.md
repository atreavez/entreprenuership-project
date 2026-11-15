# AssetTrust v0.50 - Confidential Document Metadata RLS

**Release verdict: NO-GO - development checkpoint only.** 11 November 2026.

## 1. Preserve the system

Work with the original Git clone to preserve full history. Back up PostgreSQL and test restoring it to a separate disposable database. Preserve encryption/signing keys securely. Never put production credentials in the archive, shell history or browser JavaScript. Do not run destructive test suites on production.

## 2. Extract and install verified dependencies

```bash
cd ~/Downloads
unzip AssetTrust_v50_Documents_RLS_Security_Checkpoint.zip
cd assettrust-v50
node --version
npm --version
npm install --package-lock-only
# Manually review lockfile and changes, then commit authentic package-lock.json.
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

**No genuine package lock is included in this checkpoint.** `npm ci` is expected to fail until it is generated and reviewed on an internet-connected developer machine. Do not fabricate lockfile entries or ignore high/critical advisories. Use the project Node engine (`>=22.12`).

## 3. Verify source and release checks

```bash
npm run verify:v50
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm run security:scan:v43
npm run release:preflight:v41
```

Also run every version suite v0.03-v0.50 and scan the **complete canonical Git history** with a reviewed secret-scanning tool. Rotate confirmed exposed keys at providers or server configurations; file deletion alone does not revoke a secret.

## 4. Disposable PostgreSQL/PostGIS validation ONLY

Create a loopback-only PostgreSQL/PostGIS database named `assettrust_ci` or `assettrust_test`, with fresh synthetic credentials and a migration-owner role. Never reuse customer data or production signing/encryption keys. Apply and validate the full migration chain first, with migration 025 appended to the existing 24.

```bash
export NODE_ENV=test
# DATABASE_URL: localhost / 127.0.0.1 with database ending _ci or _test
npm run db:migrate
npm run db:check
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tools/sql/v50-documents-rls-readonly-audit.sql
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:documents-rls:v50
# Run the earlier RLS contracts too, especially v0.46-v0.49.
```

The v0.50 test explicitly rejects non-loopback URLs, non-disposable database names, missing `NODE_ENV=test`, and absent mutation authorization **before** it imports the PostgreSQL client. It uses a temporary role and database fixtures within a transaction and attempts rollback. It requires a suitably privileged test operator to create its temporary role, **not** the production runtime role.

## 5. Staging rollout / production gating

- Validate the original database migration ledger and restore, audit misassigned documents, and coordinate deployment of v0.50 API instances *before* applying document RLS. Never allow older instances with unscoped professional-document reads to serve during the migration.
- Use separate migration-owner and minimal runtime roles; no `superuser`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, or ownership of RLS tables for the runtime account. Database must not be exposed publicly.
- Test document listing, encrypted upload/download, trusted professional support files, asset/case dashboards, cross-org denial, revoked permissions and pooled transaction reuse, including two API instances and a live browser.
- Independently verify HTTPS/HSTS, CSRF, secure cookies, 2FA, limited SSH/firewall, malware scanning, encrypted backups, Git-history exposure, secret rotation, dependency patching and the full cross-project security release checklist.

**Release approval must be signed off after real tests and review of all high/critical findings.**
