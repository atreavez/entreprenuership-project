# AssetTrust v0.62 — Operational data isolation and recipient-private inboxes

Date: 11 November 2026. **Development checkpoint; production release NO-GO.**

## Implemented

1. Added immutable, append-only `027_operational_data_rls.sql`. `case_tasks`, `disputes`, `monitoring_reminders` and `verification_quotes` receive PostgreSQL `ENABLE/FORCE ROW LEVEL SECURITY` with organization-scoped `USING` and `WITH CHECK` clauses.
2. `notifications` receives PostgreSQL `FORCE RLS`, but applies a stricter rule: `SELECT` and `UPDATE` require both transaction-local `assettrust.tenant_id` and `assettrust.actor_id`; `INSERT` is tenant-scoped for system-generated messages; no notification DELETE policy is added.
3. Added 12 composite-organization foreign keys on operational parent/actor/recipient references. Inconsistent historical records make the migration fail rather than delete, skip or silently alter data.
4. Updated notification list and mark-read services to execute inside tenant/recipient-scoped PostgreSQL transactions. The actor comes from the authenticated server-side `UserAuth` context, not a request parameter.
5. Expanded production startup and runtime-role RLS requirements from 8 to 13 tables. Updated v0.57/v0.58/v0.59 live role checks to query the complete, current required list instead of an outdated eight-table literal.
6. Added guarded two-organization / same-organization-different-recipient PostgreSQL test `tools/e2e-pg-operational-rls-v62.mjs`, with cross-org FK probes and transaction scope-reset checks. **Prepared but not run live in this build environment**.
7. Added read-only historical data preflight and RLS catalog audit SQL, v0.62 offline tests, CI integration and supervised release plan integration.

## Unchanged

Migrations 001–026 retain their exact original file bytes and SHA-256 hashes. This checkpoint does **not** make all AssetTrust tables RLS protected. Existing authentication, admin governance, documents, evidence, recipient shares and financial draft features remain subject to their prior validation limits.

## Upgrade and release restrictions

Do not apply 027 to a live environment while an older API is running. Before any real migration, restore-test a backup, run read-only relationship preflight, test migration on staging data, deploy API and SQL together under a controlled maintenance plan, and prove authorized and forbidden workflows with two organizations. Do not load production user data until the full security release checklist is satisfied.

**Release verdict: NO-GO.** The true npm lockfile, clean install, full build, live PostgreSQL, ClamAV, two-API HTTP, browser, Git-history and infrastructure security evidence are outstanding.
