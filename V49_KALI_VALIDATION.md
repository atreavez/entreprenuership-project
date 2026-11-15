# AssetTrust v0.49 - Kali Linux upgrade and security-validation guide

**Release decision: NO-GO** until production hardening is proven, not just described. Work on a disposable database first; do not run destructive integration tests on customer data.

## 1. Preserve existing system and verify backup

- Back up your existing PostgreSQL database and restore a copy into a separate staging/test instance. Verify the restore, migration ledger and checksums. Securely preserve document encryption and Ed25519 signing keys in a secret manager.
- Do not edit migrations already applied, delete inconsistent tenant rows to force migration, or use `db:baseline` to skip schema 024.
- Plan a maintenance/rollout window: **do not activate migration 024 while an older API version is serving requests**. Older services do not establish tenant context for assets and cases and can lose access.

## 2. Install authentic dependencies

```bash
cd ~/Downloads
unzip AssetTrust_v49_Assets_Cases_RLS_Checkpoint.zip
cd assettrust-v49
node --version
npm --version
npm install --package-lock-only
# Review the real generated lockfile, dependency changes and peer warnings.
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

Do not fabricate a lockfile or treat a failed `npm ci`, typecheck, build or vulnerability audit as a pass. Commit the reviewed lockfile to your actual repository.

## 3. Verify source and release checks

```bash
npm run verify:v49
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm run security:scan:v43
npm run release:preflight:v41
```

Run the complete v03-v49 regression matrix and the full Git-history scan in the canonical Git clone (e.g. gitleaks and/or trufflehog, with verified coverage). Rotate every credential confirmed exposed; history rewriting alone does not rotate keys.

## 4. Live migration and two-tenant tests (DISPOSABLE database only)

Provision PostgreSQL/PostGIS on loopback and create a dedicated database named `assettrust_ci` or `assettrust_test`, never your normal production database. Use a privileged **migration-owner** for schema setup, a separate nonowner app runtime role for application tests, and explicit authorization for test mutation.

```bash
# Set DATABASE_URL to a local disposable *_ci or *_test database,
# using secret injection (never paste production passwords into shell history).
export NODE_ENV=test
npm run db:migrate
npm run db:check
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tools/sql/v49-rls-readonly-audit.sql
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:assets-cases-rls:v49
```

The test refuses non-loopback DBs, names outside `*_ci` or `*_test`, absent `NODE_ENV=test`, and missing explicit authorization. Its fixtures and temporary role roll back. Execute every previous PostgreSQL contract too; some older contracts may need to set tenant scope when reading newly RLS-protected tables.

## 5. Mandatory real environment security checks

Verify that the production runtime role owns none of the six RLS tables and has no superuser, BYPASSRLS, CREATEROLE or CREATEDB. Test two distinct organizations with real sessions and permission revocation; confirm asset/case reads, edits, imports, reports, public QR verification, case evidence, file access and geospatial operations under a real PostgreSQL account. Validate session reset on pool reuse after COMMIT/ROLLBACK and two API server processes.

Separately validate HTTPS/HSTS, CSRF/secure cookies, no public SSH or database exposure, upload malware scanning, admin MFA, server-side payment checks, dependency audits, encrypted backups and restore drills, logging and security scans. Run a final adversarial assessment and preserve logs, screenshots and remediation evidence.

**Never mark production release approved until critical/high findings are closed, live tests pass and an authorized reviewer signs off.**
