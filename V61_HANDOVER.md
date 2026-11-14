# v0.61 engineering handover — AssetTrust

**Implemented:** Append-only audit ledger `audit_events` has tenant-scoped PostgreSQL `SELECT` and `INSERT` policies with `FORCE RLS` (migration 026), and all reviewed API read/write paths use transaction-local scope. The local audit proof and bootstrap script were updated. Static production-role RLS inventory now checks eight tables. A gated, seeded two-organization integration test covers independent database login, no-scope denial, own-tenant reads and append, cross-tenant denial, update privilege prohibition, rollback and cleanup.

**Verified in this environment:** See `TEST_EVIDENCE_V61.md` and `test-evidence/v61/` for exact outputs; offline tests and source inspections only. No actual database server, authentic npm lockfile or third-party scanner was available.

**Deployment precautions:** The database migration must not run while the old API is serving unscoped audit queries. Stop old API writes, back up and restore-test, stage rollout, apply migration, deploy code, verify fresh restricted runtime login, run authenticated workflows and monitor. A real production role audit and database-wide RLS review remain pending.

**Next milestone:** Obtain real Kali build and PostgreSQL evidence, identify errors, fix actual failures. Review other unprotected tenant-bearing operational, admin, account, password-reset and membership tables. No customer/land record rollout and no assertion of government certification.

**Release decision: NO-GO.**
