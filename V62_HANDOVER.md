# AssetTrust v0.62 — Engineering handover

**Source base:** full v0.61 checkpoint, updated to v0.62.0; 11 November 2026.
**Engineering outcome:** five additional organization-sensitive tables now have database RLS in source, including recipient-specific message privacy. Total source-defined RLS inventory: **13 tables**. New migration: **027**. Prior 26 migrations unchanged.

## Security and domain boundaries

- Tenant isolation is database-enforced for operational records via transaction-local organization scope.
- Notifications are also recipient-private inside one organization: only an authenticated actor's own inbox is visible and markable as read. Application-generated notifications can still be sent to other members of that same organization.
- Composite FKs prevent case/task/dispute/quote/reminder/user/notification records from pointing to parent rows belonging to another organization.
- PostgreSQL runtime role must be a non-superuser, non-table-owner with no BYPASSRLS / CREATEROLE / CREATEDB privileges.
- Real authorization still requires the service's application-level permission checks; RLS does not grant a new business privilege. Database GUCs are not a substitute for protection against arbitrary privileged SQL execution.
- Other tables (for example users, team invitations, grants, certain administrative and financial tables) still need full least-privilege and tenant-isolation review.

## Code and contracts

- `apps/api/sql/027_operational_data_rls.sql` — validated, fail-closed migration.
- `apps/api/src/contexts/tenant-isolation/application/tenant-scope.ts` — additional transaction-local recipient scope helper.
- `apps/api/src/database.ts` — `tenantRecipientQuery`, startup RLS inventory.
- `apps/api/src/notifications.ts` — scoped recipient reads and mark-read operations.
- `tools/runtime-role-policy-v57.cjs` and live v57/v58/v59 scripts — complete dynamic table checks.
- `tools/e2e-pg-operational-rls-v62.mjs` — guarded disposable two-organization / sibling recipient contract, **not run live**.
- `tools/sql/v62-operational-preflight.sql` and `v62-operational-rls-readonly-audit.sql` — operator review.
- `.github/workflows/ci.yml`, `tools/release-validation-v51.cjs` and package scripts — required validation plan.

## Rollout plan

1. Preserve/restore-test a backup and inspect existing tenant relationships on a staging copy.
2. Generate and review a genuine npm lockfile; complete clean `npm ci`, `npm audit`, API/React build and normal tests.
3. Confirm 027 has no historical cross-org violations, then apply it to disposable/staging PostgreSQL with the updated v0.62 code in a coordinated rollout.
4. Provision a separate restricted runtime role and execute v57, v60, v61, v62, v58 and v59 database contracts, plus authenticated HTTP and ClamAV tests.
5. Continue independent database permission review, operational security testing, backup restore drills and legal/privacy review before a production release decision.

**Current decision: NO-GO**, pending live evidence and external security approval. Do not describe an offline-tested source change as deployed or production certified.
