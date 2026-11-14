# AssetTrust v0.57 - Kali validation runbook

**Not production-ready. Never execute mutating integration tests against real customer databases.**

## 1. Prepare a trusted checkout

Extract `AssetTrust_v57_CI_Runtime_Role_Security_Checkpoint.zip` in a clean folder. Keep the original `.git` repository separately for its full-history scan. Do not overwrite a live `.env` or database. Use Node >=22.12, PostgreSQL/PostGIS in a disposable local database, and configured local ClamAV.

```bash
cd ~/Downloads/assettrust-v57
node --version
npm --version
npm run verify:v57
npm run verify:ci:v53
npm run build:source:v56
npm run verify:architecture
npm run verify:syntax
```

## 2. Reproducible installation and compilation

Inspect `package.json`, allowed registry sources and generated lockfile before committing it. The source ZIP does not include a genuine lockfile.

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

If any command fails, stop and preserve the entire error output. Never invent dependency versions or bypass a security gate just to get a green result.

## 3. Real CI RLS role test (disposable database only)

The safest path is to run the reviewed GitHub Actions workflow (with a fresh isolated PostGIS service and disposable `assettrust_ci` database). After `db:migrate`, it provisions a separate CI-only `assettrust_v57_ci_runtime` role through `tools/provision-ci-runtime-role-v57.mjs`. The installer only runs when `NODE_ENV=test`, `CI=true`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, and `GITHUB_ENV` is available. It masks the randomly generated password and writes the runtime URL to the CI environment, **not a source file**.

The workflow then runs:

```bash
npm run test:pg:runtime-role:v57
npm run test:pg:layout-rls:v46
npm run test:pg:evidence-rls:v48
npm run test:pg:assets-cases-rls:v49
npm run test:pg:documents-rls:v50
npm run test:e2e:two-api:v42
npm run test:e2e:ci
```

These suites use an operator connection for migrations and fixtures but send the independent runtime connection only to spawned API processes. Verify that the actual `current_user` is not a superuser, BYPASSRLS role or owner of the seven protected tables. The CI role has broad application-table DML for test compatibility; derive and document narrower grants for production separately.

For manual Kali execution, create the same limited role with a random secret using a privileged connection **only to a disposable local test database** and export `ASSETTRUST_RUNTIME_DATABASE_URL` securely without putting the password in chat or shell history. Required test settings: `NODE_ENV=test`, `CI=true`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES`, `DATABASE_URL` pointing to the local test operator account, and `ASSETTRUST_RUNTIME_DATABASE_URL` pointing to the different restricted login on the same host/port/DB. Do not simply export the operator URL for both values.

## 4. Further release blockers

Run live ClamAV checks, complete Git-history scanning on the original repository, verify HTTPS and SSH exposure, perform E2E user/admin/organization isolation tests, backup/restore, and an adversarial penetration review. All critical findings and missing evidence block release.
