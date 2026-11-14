# AssetTrust v0.67 — Kali Linux Build and Live Integration Acceptance

**For trusted local staging/testing only. Do not run fixtures against production or shared databases.** Keep your existing Git repository and prior checkpoint unchanged until changes pass regression and review. Never paste database URLs, secrets, raw `*.env`, private keys, or credentials into chats.

## A. Extract and run the safe new checks

```bash
mkdir -p ~/Projects/assettrust-v67
unzip ~/Downloads/AssetTrust_v67_Readiness_Concurrency_and_Admin_Integrity_Checkpoint.zip -d ~/Projects/assettrust-v67
cd ~/Projects/assettrust-v67/assettrust-v67
node --version
npm --version
# These tests require installed TypeScript. On an offline host with global TypeScript,
# use NODE_PATH="$(npm root -g)" only as a local development workaround.
npm run verify:v67
npm run verify:architecture
npm run verify:syntax
npm run build:source:v56
npm run diagnose:inspect:v65
```

Node 22.12+ is required. Read the actual `package.json` manifest, then review dependency versions and your original Git history.

## B. Obtain a real dependency lockfile, install and compile

```bash
# Only if the source checkout has no existing reviewed package-lock.json:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run verify:v67
npm run build
npm run build:artifacts:v56
npm run release:preflight:v51
```

`npm ci` must use an authentic lockfile generated from a trusted registry and reviewed/committed in the original Git repository. Never fake a lockfile, ignore registry/audit errors, use `--force` to suppress a conflict, or treat a source-transpilation check as an application build. Save the **first failing command** and a redacted error excerpt.

## C. Real disposable PostgreSQL/PostGIS and role verification

Follow the checked-in `V57_KALI_VALIDATION.md` through `V66_KALI_VALIDATION.md` for role provisioning, migration and RLS permission setup. The database must be a private loopback disposable `assettrust_ci` or `assettrust_test` with a migration owner and a separate nonowner restricted application role. The migrations remain **27 pinned SQL files**. Recheck PostGIS availability and that all 13 sensitive tables have FORCE RLS plus the 16 approved policies. Do not run synthetic tests on customer data.

```bash
# After privately configuring the operator/runtime database URLs and all
# required suite opt-ins documented in v51-v66:
export CI=true NODE_ENV=test
npm run integration:database:v64
```

Run existing authorization, cross-tenant writes, recipient inbox, audit, report and evidence workflow tests against this disposable DB; they must reject forbidden access. Do not disable `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE` or weaken any SQL policy to obtain passing results.

## D. Test the new burst behavior with real API instances

Start the two local, independently marked NestJS processes through the existing v0.42 supervisor after successful dependency/database setup, using the opt-ins documented in `V66_KALI_VALIDATION.md`:

```bash
export ASSETTRUST_V66_HTTP_CONFIRM=YES
export ASSETTRUST_V42_TWO_API_CONTRACT=YES
# Also configure the other documented v0.42-v0.66 confirmations.
npm run test:e2e:two-api:v42
```

Concurrently issue a small, bounded set of GET `/api/v1/readyz` calls to the **owned loopback test instances** only, and measure DB load in staging. All successful results must retain verified migration/policy/table counts. In a separate disposable negative test, intentionally perturb only a test policy, verify a **later** readiness check becomes non-200, and restore/validate the original policy. Do not alter production or a shared database.

In the built browser, open the Deployment Readiness page as an authorized administrator. Repeated manual checks, a slow first response, an unavailable integration status, role/logout changes, and an unresponsive API must not display old success evidence or misleading production-approval claims. Capture sanitized screenshots and private local test logs.

## E. Release gate remains NO-GO

Require real authentication and MFA for sensitive administrators, Argon2id/bcrypt hashes, server-only secrets, tenant data isolation at every layer, validated and parameterized inputs, HTTPS, limited SSH, abuse throttling, safe CSRF/cookie/reset handling, scanned and restricted uploads, immutable auditing, verified settlement/pricing, production debug disabled, dependency history and secret scans, authentic live browser and PostgreSQL integration, tested backups/restores and independent security review. A passing `readyz` or v0.67 unit suite is **not** a production release authorization.
