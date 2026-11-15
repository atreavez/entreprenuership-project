# AssetTrust v0.78 — Kali Linux build and database validation

**Only use your own trusted Kali machine. Do not point the disposable acceptance scripts at a production database.** These checks are designed to reveal the first real blocker rather than certify a release prematurely.

## 1. Verify the extracted source without a database

```bash
cd /path/to/extracted/assettrust-v78
npm run verify:v78
npm run verify:v11
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v41
npm run kali:migrations:plan:v78
```

The package includes all earlier source milestones. If any command fails, keep its output private and fix that failure before proceeding.

## 2. Recover genuine npm dependencies, then build

First check for a trusted original `package-lock.json`. If absent, use the existing specifically authorized generator **only on connected Kali** after reviewing the three package manifests:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:acceptance:artifacts:v68
```

Never fabricate a lockfile, substitute another project's lockfile, disable security checks, or use `npm install --force` to conceal dependency conflicts. **The real build was not successful in the v0.78 packaging environment.** Resolve errors reported by Kali; do not claim the system is compiled because syntax-only preflight passes.

## 3. Prepare disposable local PostgreSQL/PostGIS

Follow the bundled `V70_KALI_VALIDATION.md` to provision an isolated `assettrust_test` on loopback and generate private local credentials, then apply the unchanged 27 migrations. For a fresh test fixture only:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:start:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:migrate:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:provision:v70
```

Do not rerun `prepare` or `provision` over an already provisioned private environment; first use:

```bash
npm run kali:integration:doctor:v70
```

## 4. Prove the non-blocking migration lock using real PostgreSQL

The new acceptance test holds the migration lock in a separate PostgreSQL session; it does not change tenant data or the migration ledger. It requires both explicit local confirmations:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES ASSETTRUST_V78_PG_CONFIRM=YES \
  npm run kali:migrations:run:v78
```

An accepted result is `PG_CHECK_PASSED_RELEASE_BLOCKED` with 6 checks. This verifies only the migration lock and checksum-ledger behavior, **not** production release. If it fails, stop and inspect the disposable database and private diagnostics. The direct CI-mode test requires `CI=true`, `NODE_ENV=test`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, `ASSETTRUST_V78_PG_CONFIRM=YES` and an operator `DATABASE_URL` for loopback `assettrust_ci` or `assettrust_test`.

## 5. Execute remaining live acceptance

```bash
npm run kali:disputes:plan:v77
npm run kali:acceptance:plan:v73
npm run test:e2e:auth-control:plan:v69
npm run test:e2e:documents:plan:v73
```

Follow the corresponding previous runbooks for actual supervised commands. Complete browser tests, MFA authorization, upload malware scanning, two-tenant permissions, report verification, payment verification, disaster recovery and Git-history secret scanning. Record evidence of real execution and resolve any failures.

**Release verdict: NO-GO until dependency-backed build, live integration and final independently verified security gates all pass.**
