# AssetTrust v0.63 - Kali Linux build and live security validation

**Development/staging only.** Do not run synthetic database tests against production, company/customer records or shared databases. Retain v0.62 as rollback reference; no new SQL migration has been introduced in v0.63.

## 1. Extract and inspect

```bash
mkdir -p ~/Projects/assettrust-v63
unzip ~/Downloads/AssetTrust_v63_RLS_Policy_Integrity_Checkpoint.zip -d ~/Projects/assettrust-v63
cd ~/Projects/assettrust-v63
node --version
npm --version
npm run verify:v63
npm run build:source:v56
```

If the ZIP extracts into a nested `assettrust-v63` directory, change into that directory before running npm. Review code/manifest and original repository changes before deploying or replacing a working checkout.

## 2. Generate the authentic lockfile on a trusted connected machine

```bash
# Only if package-lock.json is ABSENT; never overwrite an existing reviewed lockfile.
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
npm run verify:ci:v53
npm run verify:v63
```

The new lockfile is intentionally not manufactured in the ZIP. Review and commit the genuine `package-lock.json` in version control after reviewing registry sources and dependency changes. On a failed command, fix the cause and rerun it; do not use `|| true` or bypasses.

## 3. Test with a disposable local PostgreSQL database only

Use a newly created `assettrust_ci` or `assettrust_test` database with a separate operator credential for schema operations, a restricted runtime login, and restored staging fixtures only after you have reviewed their contents. Follow `V62_KALI_VALIDATION.md` and the v57-v62 environment setup for provisioning those roles, database migrations and the seeded RLS tests. No production database or public DB host is permitted by the guarded scripts.

The new read-only catalog check requires the existing `DATABASE_URL` (operator) and `ASSETTRUST_RUNTIME_DATABASE_URL` (restricted role), whose host, port and disposable database must match. Never paste these URLs or passwords into logs or chats.

```bash
# AFTER installing dependencies, building the API and applying vetted migrations:
CI=true NODE_ENV=test ASSETTRUST_V63_POLICY_CONFIRM=YES \
  npm run test:pg:policy-contract:v63
```

Run the full supervised plan only with all existing v51-v62 opt-ins, the nonowner role, and `ASSETTRUST_V63_POLICY_CONFIRM=YES`. It deliberately blocks when a confirmation or prerequisite is absent.

## 4. Further release checks

Run the complete `npm run release:full:v51` only in a disposable environment following the existing setup instructions. Also scan the **original Git clone** for retained credentials with `npm run security:scan:v54 -- --repo <trusted-original-repository>`, run ClamAV, multi-API tests, authorized and cross-tenant CRUD, audit verification, role tests and authenticated browsers. Check backups, restore procedures, HTTPS, private document storage, admin MFA, reverse-proxy rate limiting and failover.

## 5. Interpret results

A passing v0.63 catalog check means the running database's policy definitions matched the reviewed inventory **at inspection time**. It does not prove the database stayed unchanged, that other tables are protected, or that application authorizations and real-user workflows work. Production remains **NO-GO** until the full release gate is satisfied.
