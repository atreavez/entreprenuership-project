# AssetTrust v0.31 — Kali Linux installation, upgrade and validation

**Compiled by Aturinzire Hargreave.** Run all database tests against a disposable database, never production. Version v0.31 is an offline-tested source checkpoint.

## 1. Extract and inspect

```bash
cd ~/Downloads
unzip AssetTrust_v31_Content_Template_Admin_Checkpoint.zip
cd assettrust-v31
node --version  # >=22.12 required
npm --version
```

## 2. Resolve the authentic dependency lockfile

This archive does **not** contain a verified `package-lock.json`. On a connected Kali host, generate and review it using npm (do not fabricate one):

```bash
npm install --package-lock-only
npm ci
npm run verify:v31
npm run verify:architecture
npm run verify:syntax
npm run release:gate:v17
npm run build
```

If `npm ci` cannot resolve packages, investigate actual npm/DNS/network issues before diagnosing TypeScript. Commit the real lockfile after review so CI can reproduce dependency versions. The sandbox build was **not** successful.

## 3. PostgreSQL/PostGIS migration

For a **fresh disposable** installation: copy `.env.example` to `.env` and use strong, separate secrets for JWT, MFA, and document keys, then:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

For a **previously deployed** v0.30 installation: first verify a tested backup, the exact historical checksum ledger, and migration readiness. Only migration `012_content_templates.sql` should be appended. **Do not** run legacy baseline commands against a versioned database. Preserve existing document encryption keys.

## 4. Test the SQL on a disposable local database

Use a database named with `_ci` or `_test` on loopback, per the included test policy. Set the following environment values deliberately:

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export DATABASE_URL='postgres://assettrust:YOUR_LOCAL_TEST_PASSWORD@127.0.0.1:5432/assettrust_ci'
npm run test:pg:content:v31
```

The test verifies schema ledger, tenant FK constraints, no self-approval on a sensitive report template, one pending request per key, rejection of markup, and the explicit low-risk tagline path. It wraps fixtures in a transaction and rolls them back. **It has not been run in this workspace** because there is no PostgreSQL service and required npm packages are missing.

## 5. Manual HTTP/browser acceptance test

1. Prepare a disposable organization with two genuine `ORG_ADMIN` accounts, both with active MFA. Set up a separate organization administrator; use an appointed Platform Super Admin when testing `platform` scope.
2. Start the real API and Vite frontend with properly configured secrets and valid migrations. Log in, complete MFA step-up, open **Content & Templates**.
3. Edit `report.summary` using only `{{asset_reference}}`, `{{case_reference}}`, `{{organization_name}}`. Validate its preview; verify the immutable notice and `UNPUBLISHED` watermark.
4. Propose a revision with a reason, verify it remains pending and the published revision is unchanged. Admin A must not approve the same proposal.
5. Admin B with fresh MFA approves. Verify revision increments exactly once; audit events exist and the active template is updated. Reject a subsequent proposal and verify no active change.
6. Confirm `branding.workspace_tagline` can be published directly and audited; confirm every sensitive report/notification/document template requires independent review.
7. Attempt arbitrary template keys, HTML injection, unknown placeholders, unexpected JSON fields, stale revisions, duplicate pending requests, suspended admins, revoked MFA, and unauthorized global access. All must fail closed.
8. Confirm organization B cannot access or modify organization A's templates or proposal history.
9. Confirm no report PDF, email, SMS, or website publication is triggered by the content editor. Check both desktop and narrow mobile layouts.

## 6. Outstanding release gates

- Reproducible dependency installation and real `npm run build`.
- Live PostGIS migrations and content-template SQL tests.
- Real NestJS + React E2E verification and two-person approval workflows.
- Security review, key management, backups, restore exercise, staging reliability and signed report workflow.

**Do not deploy v0.31 as a production land-record verification service.**
