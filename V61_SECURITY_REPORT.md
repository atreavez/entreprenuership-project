# AssetTrust v0.61 — Security and release assessment

**Decision: NO-GO. Development checkpoint only.**

## Security objective and implementation

v0.60 restricted the runtime account's ability to rewrite audit records but did not apply database row-level security to the audit ledger. v0.61 adds a forward-only `026_audit_events_rls.sql` migration with `FORCE RLS`, tenant-matched `SELECT`/`INSERT` policies and no `UPDATE`/`DELETE` policies. Service writes set transaction-local tenant scope before reading the chain head; verification, listing and local proof reads use tenant-scoped transactions. The trusted admin bootstrap was updated accordingly. Production startup now requires eight protected tables and rejects elevated runtime accounts.

## Validation performed and limitations

The v0.61 tests verify source rules, migration fingerprints, real application service behavior under mocked database calls, fail-closed live-test invocation, CI coverage and supervised test ordering. The seeded two-organization contract was **prepared but not run** against real PostgreSQL here. `npm run build` cannot pass without a genuine npm lockfile and installed dependencies; missing dependencies are a release failure, not a source compilation pass. Source secret scanning cannot replace whole-Git-history scanning.

## Remaining security risks

- Other tenant-bearing tables still lack comprehensive database RLS. This rollout covers only eight protected tables.
- Tenant GUC-based RLS is defense in depth and is not a full SQL-injection defense: arbitrary SQL running under a tenant-aware DB role could change the GUC. Parameterized SQL, least-privilege roles, safe credentials and network isolation remain mandatory.
- `audit_events` hash chaining is local evidence; it is not independently notarized, tamper-proof against a privileged database operator, or an official land registry record.
- Complete application builds, real database migration and RLS tests, authenticated browser and two-API tests, live ClamAV, dependency audit, deployment/TLS/backup-restore checks and independent penetration testing remain outstanding.
- Migration 026 is a BREAKING DEPLOYMENT BOUNDARY for older API versions that perform unscoped audit reads; coordinate a staged migration with a backup and rollback plan.

## Required next actions

Run the v0.61 Kali guide end to end in an approved disposable test database, review output logs, correct genuine errors, then extend RLS and operational security only with real test evidence. Until that occurs, real customer records, financial transactions and production release are **NO-GO**.
