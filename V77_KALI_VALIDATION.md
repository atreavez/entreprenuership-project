# AssetTrust v0.77 — Kali Linux validation runbook

These instructions run only on your own trusted Kali machine. All database mutations in the v0.77 live test are **restricted to a fresh local disposable test database**. Never point this workflow at production or an organization's existing data.

## Step 1 — Unpack and inspect (offline)

```bash
cd /path/to/extracted/assettrust-v77
npm run verify:v77
npm run verify:architecture
npm run verify:syntax
npm run kali:disputes:plan:v77
npm run kali:integration:doctor:v70
```

## Step 2 — Obtain genuine dependencies on connected Kali

Recover `package-lock.json` from your trusted original Git project if available. Otherwise use the existing **explicitly authorized** bootstrap only after reviewing manifests:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:acceptance:artifacts:v68
```

Stop on any error. Do not use `--force`, paste credentials into chat, fake the lockfile or make production readiness claims based on transpilation-only tests. The full build may reveal errors beyond the missing dependencies.

## Step 3 — Prepare disposable local infrastructure

Use the bundled `V70_KALI_VALIDATION.md` to prepare private credentials and verify the isolated Compose definition. If not already prepared:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:start:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:migrate:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:provision:v70
```

The ClamAV start/verification steps in the v0.70 guide remain separately mandatory for full application acceptance. An existing v0.70 private fixture must **not** be overwritten or reprovisioned; use the `doctor` command and review it instead.

## Step 4 — Verify actual cross-case locking with the restricted runtime role

The wrapper loads the private operator and runtime-role configuration from `.assettrust-local/v70`. It never prints the URLs or passwords. It requires **both explicit acknowledgments**:

```bash
ASSETTRUST_V77_PG_CONFIRM=YES ASSETTRUST_V70_LOCAL_CONFIRM=YES \
  npm run kali:disputes:run:v77
```

On a successful execution, look for `POSTGRES_ACCEPTANCE_PASSED_RELEASE_BLOCKED` and a count of PostgreSQL assertions. The test uses synthetic users, an asset, two cases and disputes, then attempts cleanup. If `FAILED` or `CLEANUP_FAILED` occurs, stop and investigate the disposable database before rerunning; do not migrate or drop a live database to clean up.

For the direct CI mode, only an explicitly authorized `assettrust_ci` or `assettrust_test` loopback database is accepted, and both the operator `DATABASE_URL` and separate `ASSETTRUST_RUNTIME_DATABASE_URL` are required. **The v0.77 PostgreSQL test was not executed in the packaging environment.**

## Step 5 — Finish runtime and security acceptance

```bash
npm run kali:acceptance:plan:v73
npm run test:e2e:auth-control:plan:v69
npm run test:e2e:documents:plan:v73
```

Follow the respective runbooks before running any live mutation. Capture redacted build/DB/API/browser findings and remediate any failures. Check admin and organization consoles, multi-case disputes, document revoke/read, tenant-isolation, quote permissions, MFA, secret scanning of **entire Git history**, secure upload/ClamAV, TLS and disaster recovery.

**Release verdict remains NO-GO** until the mandatory final security hardening and release gate is independently completed and verified.
