# AssetTrust v0.62 — Kali Linux validation and safe upgrade

These commands are intended for an extracted v0.62 directory on your Kali machine. **Never test using production records or production PostgreSQL.** Use a local, disposable `assettrust_ci` or `assettrust_test` database with PostGIS, separate operator and restricted-runtime credentials, and an original repository clone for Git-history scanning.

## 1. Verify source before dependency installation

```bash
cd ~/Downloads/assettrust-v62  # adjust to actual directory after extracting ZIP
node --version                  # requires Node >=22.12
npm run verify:v62
npm run verify:ci:v53
npm run verify:architecture
npm run verify:syntax
npm run build:source:v56
npm run release:preflight:v41
```

The preflight is expected to report **BLOCKED** while the authentic npm lockfile, dependencies, runtime secrets and compiled outputs are absent.

## 2. Genuine dependency installation and complete builds

With a trusted network and a reviewed npm registry:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
npm run build:artifacts:v56
```

If a command fails, record the exact error, stop the deployment, and fix it. Never forge a lockfile or suppress failing security gates. Do not share passwords, session cookies, `.env`, secrets or full DB connection URLs.

## 3. Review historical data BEFORE applying migration 027

First restore a real backup into isolated staging. Only on that backup/staging database, with the operator's private `DATABASE_URL` configured securely:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f tools/sql/v62-operational-preflight.sql
```

**All 12 violation counts must be zero.** Investigate any nonzero count: do not delete conflicting records, disable constraints, use `NOT VALID`, or skip migration 027 to force a green result. Use a coordinated API/deployment maintenance window: old APIs do not know the recipient RLS context and will fail to read notifications after 027.

Then, after confirmation that the URL points to `assettrust_ci` or `assettrust_test` on loopback (not production):

```bash
npm run db:migrate
npm run db:check
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f tools/sql/v62-operational-rls-readonly-audit.sql
```

The actual migration command is a privileged database mutation. Review the exact target privately beforehand and use disposable or staging data only for this checkpoint.

## 4. Execute restricted runtime and two-organization contracts

The new live test is **not enabled by default**. On a fresh, disposable local database only, privately configure:

```text
CI=true
NODE_ENV=test
ASSETTRUST_E2E_ALLOW_MUTATION=YES
ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM=YES
DATABASE_URL=<private-local-operator-URL>
ASSETTRUST_RUNTIME_DATABASE_URL=<private-local-restricted-URL>
```

Use the v0.57/v0.60 role-provisioning guide to create the restricted runtime login if needed. The operator login is for migrations and synthetic fixture cleanup only; it must **never** run the API. After configuring the other corresponding explicit consents in the earlier runbooks, execute:

```bash
npm run test:pg:runtime-role:v57
npm run test:pg:runtime-privileges:v60
npm run test:pg:audit-rls:v61
npm run test:pg:operational-rls:v62
npm run test:pg:runtime-tenant-isolation:v58
npm run test:pg:runtime-tenant-crud:v59
```

The v0.62 test commits synthetic fixtures temporarily, exercises a separate restricted connection, then performs best-effort cleanup. If interrupted, inspect the disposable database for residual `v62` fixtures before reusing it. The test checks both organization isolation and separate recipients within the *same* organization, and verifies that cross-tenant FK references are rejected even for an operator account.

## 5. Final security release checks

Continue the full supervised release plan, Git-history credential scan on your original clone, live ClamAV EICAR detection, real two-API integration, authenticated browser coverage, HTTPS, recovery/backup and external security review. All must pass; a successful RLS test alone is not commercial deployment authorization.

**Checkpoint verdict: NO-GO**, pending real installation, builds, database contracts and deployment verification.
