# AssetTrust v0.55 - Kali Linux operator runbook

**Only for a trusted development/Kali machine. Do not use a production database.** The original Git history stays at your canonical repository path. The ZIP contains no real dependency lockfile or working credentials.

## 1. Extract a fresh copy

```bash
mkdir -p "$HOME/Projects/assettrust-v55-validation"
cd "$HOME/Projects/assettrust-v55-validation"
unzip "$HOME/Downloads/AssetTrust_v55_Authentic_Lockfile_Bootstrap_Checkpoint.zip"
cd assettrust-v55
node --version  # >= 22.12
npm --version
```

If an earlier version is running, **do not overwrite its database or replace encryption keys**. This milestone has no new SQL migration.

## 2. Generate a genuine npm lockfile on a connected machine

First run the read-only check. An absent lockfile is expected in the source archive.

```bash
npm run verify:v55
npm run lockfile:check:v55
```

Then explicitly authorize **one** creation of the lockfile. Use a trusted registry connection; inspect any installation/peer warnings. This command does **not** run postinstall scripts or fabricate a dependency graph.

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run supply-chain:v51
sha256sum package-lock.json
```

If the npm registry cannot be reached, stop here; do not copy in a synthetic lockfile or bypass the dependency security policy. Review install-script dependencies and lockfile changes before committing them to the canonical repository.

## 3. Run real installation and build

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run verify:ci:v53
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

Do not use `npm audit fix --force` blindly; review each update and regression-test it. The API health endpoint should report `0.55.0` after a **successful freshly deployed build**.

## 4. Scan full, original Git history

Use the actual complete clone, not the extracted ZIP:

```bash
export ASSETTRUST_HISTORY_REPO="$HOME/Projects/assettrust-github-v22/assettrust-v22"
test -e "$ASSETTRUST_HISTORY_REPO/.git" || { echo 'Original Git history unavailable'; exit 1; }
npm run security:scan:v54 -- --repo "$ASSETTRUST_HISTORY_REPO"
```

This is only a high-confidence scanner; independently run a credential scanner such as gitleaks, manually review findings and **rotate/revoke any truly exposed keys**. Do not send secrets into ChatGPT or public logs.

## 5. Configure ClamAV, disposable PostgreSQL and run guarded live validation

ClamAV must be running and pass the v0.52 clean/EICAR contract:

```bash
npm run security:clamav:v52
```

For real PostgreSQL contracts, use a freshly created local database named `assettrust_ci` or `assettrust_test`, never real customer data. Back up and verify restore procedures before touching any existing database. Provision dedicated migration and least-privileged runtime roles. Set test-only JWT, document and MFA keys securely. The complete v0.51 release runner requires these explicit approvals, among others:

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V51_ALLOW_DATABASE_TESTS=YES
export ASSETTRUST_V51_LOCAL_CONFIRM=YES
export ASSETTRUST_V51_DB_CONFIRM=assettrust_ci
export ASSETTRUST_HISTORY_REPO="$HOME/Projects/assettrust-github-v22/assettrust-v22"
# Also configure DATABASE_URL only for an explicitly disposable local assettrust_ci database,
# plus the required test-only encryption/MFA/JWT and ClamAV settings via a private .env file.
npm run release:full:v51
npm run evidence:review:v53
```

The runner **refuses unsafe test databases**. The evidence checker does not approve production even if all local stages pass. Inspect `test-evidence/v51/local-validation-summary.json` (mode 0600) and attach sanitized results for further engineering review. Never paste database passwords or private signing keys.

## 6. Additional release requirements not automatically proven

A separate authenticated two-organization security test and administrator MFA tests, actual HTTPS/HSTS/cookie behavior, external network/SSH exposure, backup restoration, malware signatures freshness, server-side pricing enforcement (if payments enabled), security monitoring, independent penetration tests, Uganda-specific privacy/legal review and operator sign-off remain mandatory. A green `npm run verify:v55` or green local history scan is **not production approval**.
