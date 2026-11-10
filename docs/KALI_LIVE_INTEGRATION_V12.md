# AssetTrust v0.12 — Kali Linux Live Integration Procedure
**Compiled by Aturinzire Hargreave**

> This runbook is for a disposable, locally controlled development installation. Never run destructive E2E suites against production, customer data, or a reused database with records you need.

## 1. Extract and configure
```bash
cd ~/Downloads
unzip AssetTrust_v12_Integration_Safety_Checkpoint.zip
cd assettrust-v12
cp .env.example .env
openssl rand -hex 32   # generate JWT secret, independently
openssl rand -hex 32   # generate MFA key, independently
openssl rand -hex 32   # generate document key, independently
```
Place the three different values in `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, and `DOCUMENT_ENCRYPTION_KEYS` respectively, with `DOCUMENT_ACTIVE_KEY_ID=v1`. Do not change live encryption keys while upgrading existing encrypted records. For local use `NODE_ENV=development` and `WEB_ORIGIN=http://localhost:5173`.

## 2. Verify the environment
```bash
node --version
npm --version
docker --version
docker compose version
npm install --no-audit --no-fund
npm run verify:v12
npm run verify:v11
npm run build
```
`npm install` must succeed before the full compile; the offline syntax scan alone is insufficient. Review every build failure before applying migrations.

## 3. Start fresh disposable PostGIS
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```
Do **not** run the fresh-install process against an old v0.10/v0.11 database. Follow `docs/V11_MIGRATION_AND_RELEASE.md` for the backup and explicit baseline procedure. Run the migrations against an empty development database first.

## 4. Launch API with an explicit disposable test marker
In **terminal A** (while in the project directory):
```bash
export NODE_ENV=test
export ASSETTRUST_E2E_TARGET_ID="assettrust-disposable-local-v12-$(openssl rand -hex 8)"
printf '%s\n' "$ASSETTRUST_E2E_TARGET_ID" > /tmp/assettrust-v12-local-marker
npm run dev:api
```
The API must refuse startup on invalid configuration or schema. If successful, `http://127.0.0.1:4000/api/v1/readyz` reports database readiness, **not** legal or production approval.

In **terminal B**:
```bash
npm run dev:web
```
Visit `http://localhost:5173` and manually exercise login, dashboard, case review, document upload, and map controls with fictional data.

## 5. Run locally marked HTTP tests
In **terminal C**:
```bash
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_E2E_EXPECT_TARGET="$(cat /tmp/assettrust-v12-local-marker)"
export ASSETTRUST_E2E_URL=http://127.0.0.1:4000
npm run test:e2e:all
```
The scripts **must refuse** to create records unless the running API publishes the exact marker and the target is a local HTTP origin. They still create persistent test rows and files; use an isolated test database and remove it after validation. These tests do not perform official government searches.

## 6. Evidence and release decisions
Save exit codes and terminal logs for `npm run build`, migrations, `db:check`, API tests, and a browser check. Check tenant isolation with two separately registered test organizations. Inspect database encryption metadata without printing real document contents. Verify production `.env` values are different from test secrets. Do not deploy publicly until all blocking security, privacy, legal, and integration items in the project docs are resolved.

## Troubleshooting
- **`EAI_AGAIN` / ENOTCACHED**: npm registry network or package cache unavailable; fix connectivity, then retry package installation.
- **`TS2688 @types/node`**: dependency installation incomplete; not proof of an application code error.
- **`PostGIS extension unavailable`**: use a PostGIS-enabled PostgreSQL service and recheck migrations.
- **`E2E target marker mismatch`**: confirm the marker in terminal A is identical to terminal C; never disable the guard to make tests pass.
- **`Startup configuration rejected`**: fix the issue code using the platform policy. Never paste secrets into issue reports.
