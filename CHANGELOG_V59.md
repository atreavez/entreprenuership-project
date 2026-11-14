# AssetTrust v0.59 — Positive and negative tenant CRUD verification

**11 November 2026 · Development checkpoint · PRODUCTION NO-GO**

## Deliverable

The v0.58 two-organization contract proved that restricted PostgreSQL logins could not see or mutate other tenants' seeded rows. It did not show that legitimate inserts, updates and deletes would succeed. A blanket read-only policy could therefore pass parts of the negative tests while breaking the product.

v0.59 adds a **second guarded integration test** (`tools/e2e-pg-runtime-tenant-crud-v59.mjs`) that seeds two synthetic organizations and verifies the following through an independent non-superuser runtime database connection:

- Four authorized INSERT operations succeed for assets, verification cases, evidence and document metadata, with real same-tenant foreign-key relationships.
- Authorized UPDATE and DELETE each affect exactly one matching record in every table; authorized inserts can be read back.
- Cross-organization UPDATE and DELETE return zero affected rows; cross-organization INSERT is rejected.
- Tenant context resets following ROLLBACK **and** COMMIT, not just after a failed transaction.
- Transient writes are absent after the test transaction; seeded records are cleaned up on normal exit.
- Role ownership, `BYPASSRLS`, superuser and missing `FORCE ROW LEVEL SECURITY` controls are rejected by the prerequisite role contract.

Every live test is restricted to a confirmed loopback `assettrust_ci` or `assettrust_test` database, requires separate operator/runtime credentials and explicit mutation authorization, and refuses to run otherwise.

## Other engineering corrections

- The supervised database validation plan now orders tests by their security dependencies: restricted role v0.57 → seeded isolation v0.58 → functional CRUD v0.59, before two-API and HTTP suites. Previously alphabetic sorting placed CRUD before the seeded isolation check.
- The supervised runner now requires `ASSETTRUST_V59_CRUD_CONFIRM=YES` **before** any database action.
- GitHub Actions checks the new suite before `npm ci` and includes the live CRUD contract immediately after v0.58. The parser-backed workflow security check passes.
- Package and workspace versions are advanced together to `0.59.0`. No SQL migrations or domain policy changes have been introduced.

**Scope limitation:** RLS currently applies to seven selected tables, not the entire user, audit, membership, payment or administrative data model. A database role that can execute arbitrary `set_config()` calls is not, by itself, a complete authorization boundary against SQL injection; service-side authorization, parameterized SQL, database least privilege and full review remain mandatory.
