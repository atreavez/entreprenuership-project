# AssetTrust v0.49 - Assets and verification cases tenant RLS

11 November 2026. Development checkpoint; **production release not approved**.

## Code and schema

- Adds migration `024_assets_and_cases_rls.sql` with `ENABLE` and `FORCE ROW LEVEL SECURITY` and `USING`/`WITH CHECK` tenant-isolation policies on `assets` and `verification_cases`.
- Adds `Database.tenantQuery()` to execute pool reads in a transaction with a validated, parameterized `assettrust.tenant_id` PostgreSQL setting scoped to that transaction only.
- Converts asset, case, document, access, dashboard, operations and geospatial reads and mutations to tenant-scoped transactions when they access those tables.
- Updates report issuance and recipient-sharing paths; anonymous report verification resolves the organization from an unguessable existing report reference before joining RLS-protected case rows. Visitor-supplied tenant identifiers are not trusted.
- Expands production startup checks to six private RLS-protected tables and disallows app runtime superuser, BYPASSRLS or table-owner access.
- Adds guarded disposable PostgreSQL contract and read-only RLS inventory; updates CI and old isolated test doubles without weakening their authorization assertions.

## Scope and caveats

This does NOT cover users, documents, organizational membership, finance, audit records and all other private tables with RLS. Application RBAC and tenant predicates remain mandatory, and untrusted SQL access must be prevented. RLS policies relying on a custom tenant variable are not a separate identity authentication mechanism. Older APIs are not compatible after activating this migration. Test in staging before migration; preserve backups and encryption/signing keys.

Live PostgreSQL tests, dependency install/build, browser flows, infrastructure controls, full Git history scan and independent review remain outstanding.
