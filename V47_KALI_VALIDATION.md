# AssetTrust v0.47 - Safe Kali Linux Validation and Upgrade

**State: NO-GO** until production gates are cleared. Use a **disposable** database named like `assettrust_ci`, reachable only on localhost, with synthetic records. Do not run mutating integration tests on a live customer database.

## 1. Extract and inspect

```bash
cd ~/Downloads
sha256sum -c AssetTrust_v47_SHA256SUMS.txt # put the checksum and ZIP in this directory
unzip AssetTrust_v47_Core_Tenant_Integrity_Checkpoint.zip
cd assettrust-v47
node --version
npm --version
```

The ZIP does not include a genuine npm lockfile, project dependencies or the original `.git` directory. Preserve original history on your actual Git clone.

## 2. Back up and pre-audit before migration

1. Export your existing database through your standard backup procedure; **restore and validate** the export in an isolated disposable database. Ensure encryption and signing keys remain available to decrypt historical evidence.
2. On the **restored disposable clone**, run the **read-only** audit before migration:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tools/sql/v47-core-integrity-audit.sql
```

All eleven printed violation counts must be **zero**. If not, stop and investigate each historical association through an approved, audited correction process. Do not delete evidence or disable constraints to force the migration through.

## 3. Install a real dependency graph

```bash
npm install --package-lock-only --ignore-scripts
# REVIEW package-lock.json and dependency/audit findings before committing.
npm ci
npm audit --omit=dev --audit-level=high
npm run verify:v47
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

If any critical/high dependency vulnerability or build gate remains, the release stays blocked. Do not ship a fabricated or empty lockfile.

## 4. Apply and test only in disposable PostgreSQL

```bash
# Example ONLY: provision PostgreSQL + PostGIS and an isolated assettrust_ci DB first.
# Verify DATABASE_URL resolves to localhost and assettrust_ci; never print credentials.
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
npm run db:migrate
npm run db:check
npm run test:pg:core-relations:v47
npm run test:pg:layout-rls:v46
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

The new contract inserts only synthetic data, uses savepoints for expected errors, and rolls back the full fixture transaction. Ensure the tests actually executed, not merely that they appear in CI configuration.

## 5. Tenant/role security and runtime proof

- Test that administrator A cannot read, edit, share or download organization B's assets, cases, evidence, documents or private PDF reports.
- Test separate API servers with connection-pool reuse, in-flight role revocation, approved report issuance, guest report verification and recipient share redemption.
- Do not run old API instances against the new schema before compatibility is confirmed.
- Database integrity FKs are not RLS: explicitly test denied raw SELECT under a non-superuser, non-owner, non-BYPASSRLS runtime role *after* future core RLS policies are deployed.
- Confirm SSH is not exposed publicly without explicit firewall/VPN/keys, and HTTPS/HSTS work on actual deployment.

## 6. Release decision

Only record **GO** after all required checks pass with logs and independent approval. This checkpoint itself is **NO-GO**.
