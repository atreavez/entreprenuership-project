# AssetTrust v0.58 - Kali Linux live validation

**Security restriction:** Only operate on a freshly created, isolated `assettrust_ci` or `assettrust_test` database on `localhost`. Never run the seeded test against production, institutional, shared or customer data. Do not send database passwords, `.env` content or generated runtime URLs into a chat.

## 1. Validate the extracted source and real dependencies

Extract `AssetTrust_v58_Seeded_Tenant_RLS_Validation_Checkpoint.zip` into a clean working directory, then run:

```bash
cd ~/Downloads/assettrust-v58
node --version    # must be Node >=22.12
npm run verify:v58
npm run verify:ci:v53
npm run build:source:v56

# Requires a trusted, reachable official npm registry and review of package changes:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

If an installer, audit, compiler or artifact check fails, preserve the full result and **do not continue to deployment**. The supplied ZIP intentionally contains no invented `package-lock.json` or fabricated `node_modules`.

## 2. Set up a truly disposable local database

You can use an existing fresh local PostGIS test cluster, or provision a disposable container if Docker is installed. The CI workflow currently uses `postgis/postgis:17-3.5`. Example (create a fresh disposable container only, do not reuse an existing database):

```bash
umask 077
export AT58_TEST_DB_PASSWORD="$(openssl rand -hex 24)"
docker run -d --rm --name assettrust-v58-postgis \
  -e POSTGRES_USER=assettrust \
  -e POSTGRES_PASSWORD="$AT58_TEST_DB_PASSWORD" \
  -e POSTGRES_DB=assettrust_ci \
  -p 127.0.0.1:55432:5432 \
  postgis/postgis:17-3.5

# Confirm PostgreSQL is healthy before migrating.
docker exec assettrust-v58-postgis pg_isready -U assettrust -d assettrust_ci
export DATABASE_URL="postgres://assettrust:${AT58_TEST_DB_PASSWORD}@127.0.0.1:55432/assettrust_ci"
export NODE_ENV=test
export CI=true
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
export ASSETTRUST_V58_SEEDED_RLS_CONFIRM=YES
npm run db:migrate
npm run db:check
```

The example password lives only in your shell session; do not log or commit it. If the container name is already in use, inspect it rather than overwriting it. The package scripts require a complete applied schema before running the RLS test.

## 3. Create the real restricted database login

The existing provisioner refuses to overwrite an existing role and requires a private environment-output file. Outside GitHub Actions, v0.58 prevents it from printing raw generated credentials.

```bash
umask 077
export GITHUB_ACTIONS=false
export GITHUB_ENV="$(mktemp)"
chmod 600 "$GITHUB_ENV"
node tools/provision-ci-runtime-role-v57.mjs

# Import only the generated URL, without displaying it.
export ASSETTRUST_RUNTIME_DATABASE_URL="$(sed -n 's/^ASSETTRUST_RUNTIME_DATABASE_URL=//p' "$GITHUB_ENV")"
rm -f "$GITHUB_ENV"
unset GITHUB_ENV
```

This role has broad DML privileges **only for CI compatibility**; these are not recommended production grants. For a failed or repeated run, rebuild the disposable database rather than disabling security checks or recycling a role that the provisioner refuses to overwrite.

## 4. Execute genuine restricted-login assertions

```bash
npm run test:pg:runtime-role:v57
npm run test:pg:runtime-tenant-isolation:v58
npm run test:pg:layout-rls:v46
npm run test:pg:evidence-rls:v48
npm run test:pg:assets-cases-rls:v49
npm run test:pg:documents-rls:v50
```

The new test should report `ASSETTRUST_V58_SEEDED_RUNTIME_RLS` with `ok:true`, **two organizations**, **four seeded core tables**, and a positive assertion count. It should not report production approval. The script commits synthetic fixtures to allow the independent connection to see them; normal exit attempts to delete them. If a process is forcibly killed, discard and recreate the entire disposable database.

To run the supervised database/full plan, set additional confirmations first:

```bash
export ASSETTRUST_V51_ALLOW_DATABASE_TESTS=YES
export ASSETTRUST_V51_DB_CONFIRM=assettrust_ci
export ASSETTRUST_V51_LOCAL_CONFIRM=YES
npm run release:plan:v51
# Only after the other project secrets, ClamAV, CI fixtures and build are ready:
# npm run release:full:v51
```

The `--full` runner also requires complete runtime configuration, Git history, ClamAV and all application dependencies. A successful seeded RLS test alone is not sufficient.

## 5. Required independent release evidence

Continue with the existing `V57_KALI_VALIDATION.md` for ClamAV, browser/API suites, log redaction, original-repository secret scans, TLS, role grants, backup/restore and human review. For the original Git history, point `ASSETTRUST_HISTORY_REPO` to the true Git clone, not an extracted ZIP. Check that temporary role secrets and synthetic test files were not committed. Keep `NO-GO` until all mandatory gates have verified evidence.
