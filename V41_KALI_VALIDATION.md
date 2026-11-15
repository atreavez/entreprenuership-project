# AssetTrust v0.41 — Kali Linux installation and validation runbook

**Status: DEVELOPMENT CHECKPOINT.** Use only with disposable/test data until all release gates are demonstrated. Node.js >=22.12; npm and PostgreSQL/PostGIS required for live tests. Commands below are operator instructions **not a claim they were executed here**. Do not reset, baseline or drop an existing working database to force a pass.

## A. Extract and verify

```bash
cd ~/Downloads
sha256sum -c AssetTrust_v41_SHA256SUMS.txt
unzip AssetTrust_v41_Release_Engineering_Checkpoint.zip
cd assettrust-v41
node --version
npm --version
npm run verify:ci:v41
npm run verify:v41
npm run release:preflight:v41    # expected to BLOCK before dependencies exist
```

This checkpoint intentionally **does not contain a fabricated lockfile**. The preflight does not install packages, connect to PostgreSQL or grant production approval.

## B. Generate and review an authentic lockfile on a connected trusted machine

```bash
# Use npm compatible with Node 22 (project requires Node >=22.12).
npm install --package-lock-only
# Review package-lock.json, dependency sources and versions; commit the authentic lockfile.
npm ci
npm run release:gate:v17
npm run release:gate
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

If any step fails, stop and keep the release blocked. Do not insert placeholder resolved URLs or empty lock entries to satisfy the gate. The project must be checked for dependency CVEs and license issues before release. The v0.41 artifact environment could not reach the npm registry and therefore cannot supply the authentic lockfile.

## C. Offline version matrix

```bash
for v in $(seq -w 03 41); do
  npm run "verify:v${v}" || exit 1
done
```

The new `verify:ci:v41` protects against an accidentally shortened GitHub Actions matrix if future versions are added.

## D. Authorize a fresh disposable PostgreSQL/PostGIS database

**Only** use an explicitly authorized localhost `_test` or `_ci` database that can be discarded. Do not point these commands at a database with customers, personal land records, or other persistent application data.

```bash
# Example: separate test env - never reuse production secrets or settings
cp .env.example .env
chmod 600 .env
# EDIT .env: a disposable loopback DATABASE_URL; random JWT_SECRET,
# MFA_ENCRYPTION_KEY, DOCUMENT_ENCRYPTION_KEYS; valid WEB_ORIGIN; test mode.
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
# Export DATABASE_URL with the SAME approved disposable target as in .env.
# Example shape only: postgres://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/assettrust_ci
npm run db:check
npm run db:migrate
npm run db:check
npm run test:pg:recipient:v39
npm run test:pg:attempts:v40
export ASSETTRUST_V41_CONCURRENCY_CONTRACT=YES
export ASSETTRUST_V41_LOCAL_CONFIRM=YES
npm run test:pg:shared-counter:v41
unset ASSETTRUST_V41_CONCURRENCY_CONTRACT ASSETTRUST_V41_LOCAL_CONFIRM ASSETTRUST_E2E_ALLOW_MUTATION
```

**Caution:** `db:migrate` applies permanent versioned schema changes to the selected target. For an existing DB, make and test a backup first, retain encryption keys, review the migration ledger, and obtain operator authorization. `db:baseline` is not a shortcut. The v0.41 two-client runner creates and removes a strictly isolated, random test schema; it does *not* mutate actual issued reports or tenants. It requires schema creation rights on that disposable DB.

## E. Complete the live authentication and deployment gates

1. Run all historical live PostgreSQL contracts listed in `.github/workflows/ci.yml` and the supervised HTTP integration suites against the test deployment.
2. Run two distinct, MFA-enrolled active organization admins through report issuance, withdrawal, PDF layout approval, recipient share proposal/approval/revocation and independently pinned Ed25519 PDF receipt verification.
3. Repeat concurrent redemptions and failed credential attempts **through two actual independently started API instances** sharing the same PostgreSQL database, including failure during a transaction lock; validate single redemption counting and cross-instance lockout.
4. Run authenticated browser tests at desktop and mobile viewport sizes; verify no recipient secrets appear in URL/history, logs, errors, analytics or caches.
5. Review HTTPS, WAF/proxy rate limits, key custody/rotation, backup recovery, incident response, accessibility, professional accreditation/registry access, data-protection and legal disclaimers.

## F. How to read the verdict

`npm run release:preflight:v41` reports only whether selected prerequisites are present. `productionApproved:false` is intentional even when all its checks are green. File/CI syntax and mocked unit tests do not prove a live deployment. To claim production ready, retain real green CI run links, test logs, migration checks, browser screenshots/video, a reviewed vulnerability report and release approval evidence.
