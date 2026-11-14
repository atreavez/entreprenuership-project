# AssetTrust v0.48 — Development handover

**Milestone:** Private case-evidence tenant row-level security, first core-data RLS slice.

**Changed source:** `apps/api/sql/023_case_evidence_rls.sql`, migration SHA-256 manifest, `apps/api/src/database.ts`, `apps/api/src/cases.ts`, `apps/api/src/dashboard.ts`, `apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts`, `apps/api/src/contexts/verification/infrastructure/postgres-workflow.repository.ts`, package metadata and CI workflow. Added `tools/e2e-pg-evidence-rls-v48.mjs`, `tools/tests-v48/evidence-rls.test.cjs`, read-only SQL RLS audit, and operator documents. Updated historical test fixtures for the new dependency while retaining original assertions. Updated the v0.47 disposable FK test to set transaction-local tenant scope before its synthetic evidence insert.

**Offline verified:** 46/46 version commands, 9/9 new tests, architecture/CI/syntax, 23/23 migration checksums. Source scan finds no high-confidence matches, but full Git history is absent.

**Production:** NO-GO. No genuine npm lockfile, installed dependencies, PostgreSQL/PostGIS, full build, real browser testing or verified production access controls here. Migration 023 was NOT applied to any customer or live database.

**Next:** Run guarded Kali tests and fix any live PostgreSQL or browser failures. Then stage RLS for verification cases, assets and documents with complete query-path inventories; keep public verification metadata isolated from private evidence. Finish repository/infra audits and vulnerability remediation. Do not invent progress numbers or mark security gates complete without evidence.
