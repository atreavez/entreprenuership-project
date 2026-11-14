# AssetTrust v0.59 — Kali validation and safe deployment gate

**Use only a fresh, disposable local PostGIS database**, named `assettrust_ci` or `assettrust_test`, with **no customer data**. The tests intentionally INSERT, UPDATE and DELETE synthetic records. The runtime role must be a separate nonowner, non-superuser, non-BYPASSRLS login. Never share database URLs, passwords, `.env` files or private keys in chat.

## A. Reproducible install and build (connected Kali)

```bash
cd ~/Downloads/assettrust-v59
node --version            # Node >=22.12
npm run verify:v59
npm run verify:ci:v53
npm run build:source:v56

# Review package manifests and use only a trusted npm registry:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

The generated lockfile must be reviewed and committed after successful install/audit; the ZIP does not contain an invented one. If `npm ci`, audit, compilation or artifact checks fail, STOP and preserve the error log for repair. Do not bypass the gate.

## B. Disposable database and role preparation

Follow **Sections 2–3 of `V58_KALI_VALIDATION.md`** to start an isolated local PostGIS test container, set the operator `DATABASE_URL`, run 25 migrations, and provision the restricted runtime role. Keep `GITHUB_ENV` private (0600), import `ASSETTRUST_RUNTIME_DATABASE_URL` without displaying it, and delete the temporary credential file. A distinct operator login is needed only for fixture creation; the live CRUD contract uses the restricted login for its checks.

If anything in the original role setup is unclear or the chosen database contains existing records, STOP. Do not disable RLS, modify production permissions or re-use a real organization database to force a test to pass.

## C. Genuine RLS, then functional CRUD (requires all prerequisites)

```bash
export CI=true
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
export ASSETTRUST_V58_SEEDED_RLS_CONFIRM=YES
export ASSETTRUST_V59_CRUD_CONFIRM=YES

# Ensure your two *different* DATABASE_URL variables already exist.
npm run db:check
npm run test:pg:runtime-role:v57
npm run test:pg:runtime-tenant-isolation:v58
npm run test:pg:runtime-tenant-crud:v59
```

The final command must emit `ASSETTRUST_V59_SEEDED_RUNTIME_CRUD_RLS` with `ok: true`, `authorizedCrudTested: true`, two organizations and a positive assertion count. This output is a successful **test contract**, not production authorization. If any command fails, preserve its redacted output, discard the disposable database and investigate; do not repeat on a shared database.

For the supervised database plan, follow `V58_KALI_VALIDATION.md` section 4 and also set the v0.59 confirmation above. The runner now orders the restricted-role, seeded-isolation and functional-CRUD checks before API/HTTP integration.

## D. Mandatory additional release checks

Real ClamAV clean/infected tests, two separate API servers, authenticated reviewer/recipient workflows, CSRF and rate-limit abuse tests, whole original Git-history scan (not a ZIP scan), signing-key security, independent vulnerability assessment, HTTPS reverse proxy, restore drill, legal/privacy review, and **every** 11-point release prerequisite must pass before customer deployment. Do not treat offline unit-test totals as these live checks.

**Current status: NO-GO.**
