# AssetTrust v0.81 — Kali Linux Build and Startup Acceptance

This runbook applies to a **trusted local non-production checkout** of `assettrust-v81`. It does not mutate any existing production or development database and must not be applied directly to a real customer instance.

## 1. Offline verification, no database mutations

```bash
cd /path/to/assettrust-v81
node --version  # Node >=22.12
npm run verify:v81
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run verify:ci:v53
```

v0.81 requires `LOGIN_ABUSE_PEPPER` even for development/testing; generate a separate random key: `openssl rand -hex 32`. Do **not** commit it. Configure and protect all other mandatory keys and the database URI following `.env.example` and the v0.70 isolated-test guide. For synthetic test API instances, use `NODE_ENV=test`; never publish API port 4000 to the LAN. An explicit `API_BIND_HOST=0.0.0.0` is rejected for test mode.

## 2. Trusted npm dependencies and genuine compilation

Confirm you are in the **fresh ZIP extraction** with no existing `package-lock.json`. The guarded bootstrap below is permitted only if no authentic reviewed lockfile already exists. If there is a lockfile in your actual Git repository, compare and reconcile with it instead of overwriting.

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

A `npm ci`, `npm audit` or compile failure **blocks acceptance**. Capture the first genuine error and affected source file *without any secret environment values*. Do not use synthetic `@types` modules or substitute globally installed types for the actual project graph.

## 3. Disposable PostgreSQL acceptance (separate from your regular database)

Review the v0.70 isolated Compose environment and the v0.71 supervisor. They require explicit opt-in, loopback-only Docker connectivity, a disposable database named `assettrust_test` or `assettrust_ci`, and a restricted non-owner runtime PostgreSQL role. Begin with read-only planning:

```bash
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v73
npm run kali:migrations:plan:v78
npm run kali:disputes:plan:v77
```

Follow their respective handovers to provision the isolated database, test migrations, real RLS protection, document grants/revocations, authentication, MFA, dispute concurrency and browser behavior. Do not run mutation tests against your ordinary `assettrust` database or any remote DB. Capture successful and negative test evidence and audit logs; review independently.

## 4. Startup-specific acceptance after real compilation

With private `.env` configured, verify the following **without logging secret values**:

- Omitting `LOGIN_ABUSE_PEPPER` aborts startup with `LOGIN_ABUSE_KEY_INVALID` **before** any listener binds.
- Invalid `PORT=0`, `PORT=65536`, or `PORT=abc` aborts startup with `PORT_INVALID`.
- Disparate comma-separated WEB_ORIGIN entries with surrounding spaces are normalized identically in validation and actual CORS behavior.
- An E2E ownership marker outside test mode aborts startup. A test API can bind only to loopback. A mismatched expected marker aborts startup.
- Correctly configured development and owned disposable test APIs start, return `/api/v1/healthz` and `/api/v1/readyz` with verified migration+RLS readiness, and demonstrate authenticated real business workflows.

These are required **future live checks**; the ZIP's offline tests do not imply they have been executed.

## 5. Release decision

Production remains **NO-GO** until authentic lockfile review, install/audit, API and frontend builds, live PostgreSQL/RLS tests, role and MFA testing, upload malware scanning, TLS deployment, backup/restore, Git-history secret scans, dependency audits, and independent adversarial security acceptance all pass. Do not weaken gates to produce a green status.
