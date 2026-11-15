# AssetTrust v0.47 - Development Handover

## Scope delivered

- New additive, fail-closed `022_core_tenant_relationship_integrity.sql` migration: 4 composite unique keys, 11 tenant-aware FKs.
- Read-only mismatch-audit SQL `tools/sql/v47-core-integrity-audit.sql`.
- Guarded live PostgreSQL synthetic contract `tools/e2e-pg-core-relations-v47.mjs` (NOT executed here).
- Offline `tools/tests-v47/core-tenant-integrity.test.cjs` (10/10 pass) and CI wiring.
- Historical v0.46 migration test fixed to preserve identity of migration 021 when later migrations are appended.
- Immutable manifest extended to 22 SHA-256-pinned migration files; no previous SQL migration changed.

## Evidence and limitations

- All 45 version suites passed offline; architecture and syntax checks passed; 22/22 migration hashes matched; current-source high-confidence scan passed (1,783 files).
- Cannot claim production build, full test or PostgreSQL execution. These remain blocked by missing genuine lockfile, dependencies, and PostgreSQL in this environment.
- **NOT** blanket RLS: core rows may still be visible in direct SQL under a privileged or unscoped query. Current application-layer tenant filtering must remain. v0.46 RLS still protects only private PDF layout tables.
- Preflight: 3/11 prerequisites present; production NO-GO.

## Next engineering scope

**v0.48:** Review and transaction-scope all core asset/case/evidence/document query paths (including internal modules, background workers, report issuance and public verifier). Add guarded `FORCE RLS` by table, create non-owner runtime grants, prove two-tenant read/write isolation with actual PostgreSQL. Do not enable a migration that unexpectedly denies authorized traffic on older API instances.
