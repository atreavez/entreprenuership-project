# Kali Linux — AssetTrust v0.24 validation runbook

## Initial setup

```bash
unzip AssetTrust_v24_Case_Evidence_Transactional_Authorization_Checkpoint.zip
cd assettrust-v24
node --version
npm --version
```
Node 22.12+ is required. Ensure a reliable internet connection and the npm registry is reachable.

### Authentic dependency installation

```bash
npm install
# Review package-lock.json and commit it to source control.
npm ci
npm run release:gate:v17
npm run verify:v24
npm run verify:architecture
npm run verify:syntax
npm run build
```

Do **not** create a handcrafted lockfile or bypass the release gate. If the registry is inaccessible, correct the DNS/network issue rather than modifying the gate. A genuine build success has not been observed in the packaged environment.

## PostgreSQL/PostGIS
Only with a **new disposable local** database, configure `.env` using generated independent secrets and the project-documented schema bootstrap. Start PostgreSQL/PostGIS and run:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

**Existing v0.10+ databases need the versioned-migration backup/baseline procedure**, not blind fresh-install migrations. Never use real organization records for integration tests.

For the live v0.24 case authorization SQL test, configure a separate loopback database named `assettrust_v24_test` or `assettrust_ci`. Apply migrations there first. Then explicitly authorize the rollback-only fixture:

```bash
NODE_ENV=test \
ASSETTRUST_E2E_ALLOW_MUTATION=YES \
DATABASE_URL='postgres://assettrust:YOUR_LOCAL_TEST_PASSWORD@127.0.0.1:5432/assettrust_v24_test' \
npm run test:pg:case-evidence:v24
```

Use a test-only account and secret; do not paste passwords into public logs. The test refuses remote hosts and non-test database names.

## Required release evidence
- `npm ci` and authentic `package-lock.json` validation
- `npm run build` successfully compiling both applications
- Migrations, PostGIS extensions, database readiness, and repeat-migration verification
- Live MFA/authentication, professional approval, evidence submission, document encryption, and geospatial authorization
- Browser end-to-end tests and release hardening checks

**v0.24 is NOT production-ready** until these release gates pass.
