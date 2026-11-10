# AssetTrust v0.15 — Kali Linux verification runbook

## Purpose

This checkpoint makes local integration tests safer. It does not add government registry authorization, payments, blockchain notarization, production signed certificates or licensed survey verification. Private evidence remains distinct from official land ownership records.

## Run on Kali Linux

Unzip the archive into a fresh directory. On a connected machine with Node.js 22.12+ and Docker Compose:

```bash
node --version
npm --version
npm install
npm run preflight:v14
npm run verify:v15
npm run verify:v14
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

Review the generated `package-lock.json`, confirm the package dependency versions and commit it to the authorized repository. In CI, replace `npm install` with `npm ci` after the reviewed lockfile is committed. Keep all secrets out of Git and build logs.

## Fresh, disposable PostgreSQL/PostGIS only

1. Copy `.env.example` to `.env`. Use a **fresh database without real customer records**. Configure `DATABASE_URL` with a local `assettrust_ci` or `assettrust_test` database for E2E.
2. Generate independent secrets for JWT (`openssl rand -hex 32`), MFA encryption (`openssl rand -hex 32`), and document encryption (`openssl rand -hex 32`). Use the prescribed JSON keyring format. Never rotate a previous document key without migrating stored ciphertext.
3. Run `docker compose up -d postgres`, `npm run db:migrate`, and `npm run db:check`. If an older populated database already exists, use the verified backup/baseline procedure from v0.11 instead of applying fresh-install steps.
4. Run `npm run build` and `npm test` successfully before any live integration suite.
5. The supervised integration runner is CI-only: it requires `CI=true`, `NODE_ENV=test`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, an `ASSETTRUST_E2E_URL` at localhost, a specifically named disposable local database, and a matching **job** identity marker. It then generates a new **run** marker and passes it only to the spawned API and HTTP test clients.
6. After those safeguards are satisfied, run `npm run test:e2e:ci` (or the CI GitHub Actions workflow). It creates and mutates test records; do **not** point it at an existing tenant database or any production service.

### CI checklist

Use `.github/workflows/ci.yml` as a reference. Check that the generated job marker appears in both `ASSETTRUST_E2E_TARGET_ID` and `ASSETTRUST_E2E_EXPECT_TARGET`. The supervisor generates a different, unguessable run marker. The test API listens only on loopback; its `healthz` identifies the supervised child and its `readyz` checks schema and PostGIS.

### Interpreting a build failure

- `TS2688: Cannot find type definition file for 'node'`: install dependencies and confirm `@types/node` is present; this does *not* prove API compilation succeeded.
- `db:check` failure: do not force-run the app; inspect the SQL migration ledger, PostGIS installation and restore/baseline instructions.
- Identity mismatch on API port: do not bypass the marker check. Stop the unexpected local process or use an unused port.
- HTTP tests fail: preserve sanitized logs, fix the observed bug and rerun the full regression suite.

### Release gates

A release requires a complete React/NestJS production build; migration+restore evidence; real authentication/session and professional trust E2E; document encryption/tamper tests against persisted files; tenant-boundary and geospatial API tests; responsive browser tests; and independent security review. None may be inferred from offline syntax checks.
