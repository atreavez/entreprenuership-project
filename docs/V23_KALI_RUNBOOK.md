# AssetTrust v0.23 — Kali Linux Build and Test Runbook

This release is an offline security checkpoint and **must not be deployed into production** before real build/database/browser gates succeed.

## 1. Extract

```bash
unzip AssetTrust_v23_Transactional_Authorization_Checkpoint.zip
cd assettrust-v23
node --version
npm --version
```

Use Node.js 22.12 or newer; ensure the machine has network connectivity to the package registry.

## 2. Generate an authentic lockfile

The project has never successfully generated `package-lock.json` in the isolated artifact environment. Do not fabricate one or bypass the release gate:

```bash
npm install
# Review dependency tree and lockfile in version control.
npm ci
npm run preflight:v14
npm run release:gate:v17
```

Record the full error output if any command fails; do not continue to database mutation scripts on an unverified install.

## 3. Configure secrets

Copy `.env.example` to `.env` only for a fresh local installation, and generate **separate** 32-byte secrets using `openssl rand -hex 32`. Use a JSON document keyring and a new active document key ID. For an existing installation, do not replace any encryption keys required to decrypt old records. Review `docs/V11_MIGRATION_AND_RELEASE.md` before upgrading an existing database.

## 4. Unit tests and build

```bash
npm run verify:v23
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

The v0.23 suite checks permission expiry and downgrades, contribution rights, case isolation, orphan cleanup, and TypeScript syntax of the new adapter. A successful isolated check does not guarantee the full application build.

## 5. Disposable PostGIS integration

Use a fresh **throwaway** PostgreSQL/PostGIS database (for example `assettrust_ci`) reachable on localhost only. Never point the live tests at an existing customer database.

```bash
export NODE_ENV=test
export DATABASE_URL='postgresql://assettrust:YOUR_TEST_PASSWORD@127.0.0.1:5432/assettrust_ci'
npm run db:migrate
npm run db:check
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:access:v23
```

The script refuses missing explicit authorization or remote/non-disposable targets. To validate the whole platform, also run the supervised HTTP tests documented in `docs/V15_RUNBOOK.md` (after configuring the disposable marker, runtime secrets, and test environment). Then manually verify the frontend in a browser and gather end-to-end logs.

## 6. Report any build failure

Copy the **first real compiler error after dependencies are installed** along with `node --version`, `npm --version`, and the `npm ci` result. Remove passwords, tokens, and sensitive file paths from shared logs.
