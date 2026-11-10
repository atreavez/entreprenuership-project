# AssetTrust v0.22 — Kali Linux build and live-verification runbook

## 0. Scope and constraints
This archive carries the *entire* app (NestJS, React, PostgreSQL/PostGIS SQL, evidence/document/security/geospatial contexts, and responsive interfaces). v0.22 corrects professional-trust authorization **without adding new screens**. It has passed offline tests, **not** a full build or live API tests.

## 1. Extract and verify Node
```bash
cd ~/Downloads
unzip AssetTrust_v22_Professional_Trust_Session_Expiry_Checkpoint.zip
cd assettrust-v22
node --version
npm --version
```
Use Node >=22.12. Do not use production credentials or an existing production database when testing.

## 2. Install and review the reproducible dependency graph
An authentic lockfile is NOT bundled because this environment cannot install from npm. On a connected Kali machine:
```bash
npm config get registry
getent hosts registry.npmjs.org
npm install --package-lock-only
npm ci
npm run preflight:v14
npm run release:gate:v17
```
Review the generated `package-lock.json` and commit it after review. If the network blocks npm, fix network/DNS/registry access before continuing; do not create a placeholder lockfile or bypass CI.

## 3. Execute offline tests and full build
```bash
npm run verify:v22
npm run verify:v21
npm run verify:architecture
npm run verify:syntax
npm run build
```
A successful syntax-only check is not a successful full build. If `npm run build` fails, retain the *first complete error output* rather than copying only the last line.

## 4. Create a separate disposable test database
**Never point to production or persistent data.** Provide a PostgreSQL/PostGIS service on loopback using the documented `compose.yaml` or your own local isolated test stack. The new script refuses to operate except when `NODE_ENV=test`, mutation authorization is explicit, and the database is loopback-only with a name ending `_ci` or `_test`.

Illustrative fresh disposable database URL (adapt the credentials to your local test service):
```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export DATABASE_URL='postgres://assettrust:YOUR_LOCAL_TEST_PASSWORD@127.0.0.1:5432/assettrust_ci'
```
Be certain the target `assettrust_ci` is disposable and isolated from any operational records. Do not reuse a DB in service. After a verified backup of any unrelated existing data, provision a fresh test schema and apply the documented versioned migration flow:
```bash
npm run db:migrate
npm run db:check
npm run test:pg:parcel-auth:v21
npm run test:pg:trust-session:v22
```
**Only** perform migrations on the intended fresh test database. An existing v0.10+ database needs the separate explicit migration baseline procedure; the above is not an upgrade command.

The v0.22 PostgreSQL check verifies the actual authorization SQL in seven scenarios (3 queries each). It starts `BEGIN`, sets query timeouts, writes synthetic fixtures and always attempts `ROLLBACK`. The guards reject remote URLs and databases not ending `_ci`/`_test`.

## 5. Integration and release gates
Configure valid and **independent** JWT, MFA and document-encryption keys; keep them out of logs, archives and Git. Then run the supervised HTTP tests as documented for the selected test environment:
```bash
npm run test:e2e:ci
```
That command requires the existing per-run disposable API marker and local environment setup; see `docs/V15_RUNBOOK.md`, `docs/V21_KALI_RUNBOOK.md` or `.github/workflows/ci.yml`. Follow CI's full job ordering.

**Do not deploy** until `npm ci`, build, migrations, live PostgreSQL assertions, authentication, documents, geospatial and browser E2E tests all pass and have auditable outputs. Never substitute an offline SQL-mock test for a PostgreSQL test.
