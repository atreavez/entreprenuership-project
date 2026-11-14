# v0.48 — Private evidence RLS design

## Enforcement and boundaries

- Protected through migration 021 (unchanged): `report_pdf_layout_proposals`, `report_pdf_layout_revisions`, `report_pdf_layout_active`.
- Newly protected through migration 023: `case_evidence` (all operations under organization-scoped policy, FORCE RLS).
- Relational tenant integrity through migration 022: 11 cross-organization composite FK constraints for core records, **not** RLS.
- Remaining for later controlled rollouts: `assets`, `verification_cases`, `documents`, `users`, evidence attachments and other private domain tables.

### Tenant authorization path

Authentication and case-specific privileges remain in the application. For evidence access, services open a `Database.transaction()`, obtain the organization ID from the already authenticated server-side user or authorized workflow actor, and call `setTenantScope(tx,organizationId)`. Only then does `tx.query(...)` read/write `case_evidence`. The scope is transaction-local, so pooled connections do not retain it after COMMIT/ROLLBACK.

Updated access paths: `cases.ts` submission/list, `dashboard.ts` evidence report, `report-issuance.module.ts` issuance snapshot, and `postgres-workflow.repository.ts` read/review/advance use cases. Do not introduce a new direct query path without adding equivalent transaction scope, authorization and regression tests.

### Roles and limitations

Production startup checks prohibit superuser, BYPASSRLS and elevated PostgreSQL runtime roles, and prevent protected table ownership. The migration/backup operator must be a **separate** audited role; do not grant it to the running API. A tenant-scoped RLS GUC can be changed by code allowed to run arbitrary SQL, so RLS is defense in depth, not a replacement for parameterized SQL or service authorization. There is no built-in platform-admin wildcard or automatic public exception for private evidence.

### Migration/rollback safety

Migration 023 is additive and does not alter old schema/checksums. It needs a verified backup and a coordinated API rollout: existing API instances may not set the tenant context and therefore may fail. Do not delete records, bypass policies, or baseline away a migration. A rollback requires operator review, backup compatibility and explicit authorization; do not make ad hoc production modifications to the schema ledger.
