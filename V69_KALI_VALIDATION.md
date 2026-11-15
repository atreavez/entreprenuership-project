# AssetTrust v0.69 — Trusted Kali Live Integration Runbook

**Development/staging only — writes synthetic data. Production: NO-GO.** This runbook must not be executed against an actual customer database, shared staging environment, internet-exposed PostgreSQL server, or an existing business account. Retain your original Git repository history and authentic lockfile; do not overwrite them with a ZIP export.

## 1. Unpack and verify source

```bash
mkdir -p ~/Projects/assettrust-v69
unzip ~/Downloads/AssetTrust_v69_Authenticated_Admin_and_Tenant_Acceptance_Checkpoint.zip -d ~/Projects/assettrust-v69
cd ~/Projects/assettrust-v69/assettrust-v69
node --version
npm --version
npm run verify:v69
npm run test:e2e:auth-control:plan:v69
npm run verify:ci:v53
npm run build:source:v56
```

If your ZIP extracts to a different location, enter the directory containing the v0.69 `package.json`. Node >=22.12 is required. These commands need **no database credentials**.

## 2. Authentic dependency installation and compilation

The source checkpoint deliberately has **no** fabricated `package-lock.json` or `node_modules`. On connected Kali, keep an existing reviewed lockfile from the original Git checkout, if present. Only if the lockfile is absent, run the previously guarded lockfile generator and review the result before trusting the dependency graph:

```bash
# Only if package-lock.json is missing:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55

npm run lockfile:check:v55
npm run build:acceptance:inspect:v68
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

The supervised runner performs real `npm ci`, dependency auditing, backend and frontend builds, and artifact checks. A failure is **not** waived: preserve the **redacted first failure** in `test-evidence/v68/build-acceptance.json`, fix the cause and rerun. Do not use `--force`, manually fabricate `dist`, or substitute a synthetic lockfile.

## 3. Disposable PostgreSQL/PostGIS and restricted runtime login

Provision a fresh **loopback-only** `assettrust_ci` or `assettrust_test` database with PostGIS. The database operator and the API runtime roles must differ. Run vetted migrations; follow `V57_KALI_VALIDATION.md`–`V68_KALI_VALIDATION.md` for role setup, environment, secrets and the existing integration safety confirmations. The CI workflow can provision the restricted `assettrust_v57_ci_runtime` role into a fresh GitHub Actions PostGIS service. Local Kali must use the same verified restricted-role grant boundary and fresh randomized credentials stored privately.

**Do not print or paste database URLs, passwords, JWT secrets, MFA keys, upload keys or raw logs.** Do not set the runtime URL equal to the operator URL. Ensure the API is started only against the restricted runtime login.

## 4. Run all five real supervised HTTP/PostgreSQL suites

After **successful** build, local PostGIS migrations and all v57-v68 safety prerequisites are configured, execute from the trusted repo with these *non-secret* test flags:

```bash
export CI=true
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
export ASSETTRUST_E2E_URL=http://127.0.0.1:4000

# Operator DATABASE_URL, restricted ASSETTRUST_RUNTIME_DATABASE_URL,
# and the remaining vetted CI configuration must already be configured privately.
node tools/ci-live-integration.mjs
```

The supervisor creates its own unpredictable API ownership marker and starts the compiled API with the restricted runtime role. For the v0.69 suite only, it enables `ASSETTRUST_V69_AUTH_CONFIRM=YES` internally after all preflight checks. Do **not** run `npm run test:e2e:auth-control:v69` against an arbitrary open local API or create an easy-to-guess marker. The test intentionally creates synthetic organizations, users, and assets. It must check 27 verified migrations, 16 approved RLS policies and 13 protected tables. The output report is written with `0600` permissions to `test-evidence/v69/authenticated-control.json`. It contains no account passwords, access tokens or invitation secrets.

The supervisor runs five suites in series with 65 seconds between suites to respect global rate limits. Disable no throttling middleware. Any failure is a hard test failure; fix it and rerun using a *fresh disposable database*, with no production traffic.

## 5. Review actual acceptance and release evidence

A truly executed v0.69 integration run must show `AUTHENTICATED_ACCEPTANCE_PASSED_RELEASE_BLOCKED` and all eleven v69 workflow checkpoints, with `productionApproved: false`. Also require `test:pg:runtime-role:v57`, `test:pg:policy-contract:v63`, `test:pg:runtime-privileges:v60`, `test:pg:runtime-tenant-isolation:v58`, `test:pg:runtime-tenant-crud:v59`, v61/v62 RLS tests, v42 two API smoke, full browser tests and the other security gates from the v0.68 guide.

If the v0.69 suite reports `BLOCKED` or `FAILED`, report only the fixed error code and the last successful checkpoint. Never share token-bearing HTTP responses or the raw test environment. Destroy the synthetic database and private test data after review.

**No release is approved automatically.** Keep the application off production until full deployment, restore, security and adversarial checks are complete.
