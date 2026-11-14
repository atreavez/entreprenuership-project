# AssetTrust v0.61 — Audit-ledger tenant isolation

**Scope:** Enforce PostgreSQL tenant isolation on the append-only `audit_events` ledger, close all direct API audit-read/write access paths, require the new RLS at production startup, and add a guarded live PostgreSQL contract.

### Changes

1. `apps/api/sql/026_audit_events_rls.sql`: forward-only migration with `ENABLE/FORCE ROW LEVEL SECURITY`, tenant-scoped `SELECT` and `INSERT` policies; no `UPDATE` or `DELETE` policy. Missing tenant context yields no matching rows.
2. `apps/api/src/audit.ts`: set tenant context within the caller's transaction **before** audit-chain head reads and writes; list and verify use `Database.tenantQuery`.
3. `apps/api/src/integrations.ts`: local audit proof reads use a tenant-scoped transaction.
4. `tools/bootstrap-platform-admin-v28.mjs`: manually approved platform bootstrap sets transaction-local tenant context before appending to its audit chain.
5. `apps/api/src/database.ts` and `tools/runtime-role-policy-v57.cjs`: startup and restricted role require eight RLS tables instead of seven. The v57/v58/v59 runtime tests include the additional table in their inventories.
6. `tools/e2e-pg-audit-rls-v61.mjs`: explicit-consent disposable DB contract with two independent connections, seeded organizations, own-tenant reads and appends, denied cross-tenant reads/inserts, absent UPDATE privilege, tenant-context reset checks and fixture cleanup.
7. CI/release validation and `tools/tests-v61/`: add test commands, prior-to-install source checks and live test ordering. Historical expectations only changed where an appended migration or new RLS table would make an old static count stale.
8. `tools/sql/v61-audit-rls-readonly-audit.sql`: non-mutating metadata inspection for operators.

### Unchanged

- Previously applied SQL migrations 001–025 and their SHA-256 fingerprints.
- The application remains a records-and-evidence verification service, **not** official title certification; the current audit hash chain is local and not external blockchain anchoring.

### Release assessment

**NO-GO.** This source checkpoint does not include an authentic lockfile and has not completed a live PostgreSQL migration, full API/browser compilation, ClamAV service test, original-repository Git-history audit or real authenticated UI journeys.
