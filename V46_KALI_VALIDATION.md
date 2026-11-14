# AssetTrust v0.46 - Kali Linux security validation runbook

**Release status: NO-GO.** Execute only on your Kali/Linux environment with the original repository history and a dedicated disposable database for integration tests. The source ZIP does not contain a genuine package lockfile or node_modules.

## 1. Preserve data before any upgrade

1. Back up the PostgreSQL database and verify restoration to a separate test database. Preserve document encryption keys, signing keys and their identifiers in a safe secrets manager.
2. Verify migration ledger and checksum history for all 20 previous migrations. Never overwrite or edit an applied migration. Do not use `db:baseline` to skip `021_pdf_layout_rls.sql`.
3. Do not apply migration 021 while an older API version is still serving report-layout requests: older instances do not establish the required tenant context and will be denied.
4. Provision separate, audited **migration-owner** and **runtime** DB roles; no publicly reachable PostgreSQL. The runtime role must be neither a superuser nor BYPASSRLS/CREATEROLE/CREATEDB, must not own the protected tables and must have only approved table privileges. Prefer distinct passwords entered interactively or via secret injection, never in browser JavaScript or committed files.

## 2. Extract and install an authentic dependency graph

```bash
cd ~/Downloads
unzip AssetTrust_v46_PDF_Layout_RLS_Checkpoint.zip
cd assettrust-v46
node --version
npm --version
npm install --package-lock-only
# Review package-lock.json, resolve peer/version warnings and commit the authentic generated lockfile.
npm ci
```

Do not deploy if `npm ci`, `npm audit --omit=dev --audit-level=high`, or `npm run build` fails. Do not fabricate a lockfile or ignore audit vulnerabilities.

## 3. Verify offline unit and source policies

```bash
npm run verify:v46
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm run security:scan:v43
npm run build
```

Re-run all version checks (v03 through v46), `npm test`, and complete Git-history secret scanning on the **actual Git clone** using gitleaks/trufflehog or an approved equivalent. Rotate any exposed credentials; deleting a file does not remove secrets from Git history.

## 4. Disposable PostgreSQL RLS contract - never production

Set `DATABASE_URL` to **localhost** and a database named `assettrust_ci` or `assettrust_test`, with PostGIS installed and all migrations applied. The test needs a fixture-owner/migration role permitted to create a temporary NOLOGIN role for the duration of one rolled-back transaction (CI uses a disposable PostgreSQL superuser exclusively for fixture setup). Never run this against production.

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
# Set DATABASE_URL privately to an explicitly disposable loopback *_ci or *_test DB.
npm run db:migrate
npm run db:check
npm run test:pg:layout-rls:v46
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

The contract must prove: 3 policies enabled+forced, no-context denial, tenant A/B data separation, denied foreign-tenant INSERT, unprivileged NOLOGIN role without BYPASSRLS, and rollback of all fixtures. A successful **offline test** does not substitute for this live database test.

## 5. Staging and production gates

- Deploy schema migration with a dedicated migration owner and switch the application to the least-privileged runtime DB account; verify `NODE_ENV=production` startup explicitly rejects owner/superuser/BYPASSRLS credentials and missing policies.
- Test current MFA, PDF layout administration, recipient share redemptions and public QR verification with two independent organizations and separate identities.
- Verify no tenant context leaks across pooled connections on COMMIT, ROLLBACK and reconnect.
- Run full integration, browser, adversarial, backup/restore, TLS, deployment, secret history, malware upload, admin and pricing security tests.
- Preserve signed reports and immutable history; do not call an AssetTrust evidence report an official land-title certificate.

**Stop deployment for any critical or high finding, unverified mandatory gate, or unexpected cross-tenant visibility.**
