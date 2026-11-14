# AssetTrust v0.59 — Security and release assessment

**As-of:** 11 November 2026. **Decision: PRODUCTION NO-GO.**

## Purpose

Close the false assurance risk in seeded tenant RLS testing: a database role that cannot write any rows might satisfy negative denial checks even though legitimate customer workflows are broken. The new v0.59 contract proves both legitimate CRUD and malicious cross-tenant denial on an intentionally disposable PostgreSQL database.

## Implementation

The v0.59 test seeds two organizations through an operator connection, checks the non-owner restricted runtime login, creates and updates four related kinds of own-tenant records, deletes each own-tenant test record, and probes cross-tenant UPDATE/DELETE/INSERT denial. It tests transaction-local tenant context after rollback and commit and verifies no transient records remain. It retains the v0.58 test for separately seeded isolation.

The CI runner previously used lexical ordering that would place `runtime-tenant-crud` before `runtime-tenant-isolation`. This checkpoint enforces v0.57 → v0.58 → v0.59. Mutation is guarded by an additional `ASSETTRUST_V59_CRUD_CONFIRM=YES` requirement. Only loopback database names `assettrust_ci` and `assettrust_test` are accepted.

## Verified

**15/15** new offline tests; **57/57** version suites; valid parsed CI YAML, architecture, syntax and source checks; all **25/25 SQL migrations** byte-identical to v0.58. No new migration.

## Unverified / release blockers

`npm ci` blocked (authentic lockfile absent). Full TypeScript build failed (dependencies missing). Database CRUD test NOT RUN live; PostgreSQL and ClamAV absent here. Whole Git history, browser workflows, real HTTPS, backup/restore, privilege review, penetration test and Uganda land/privacy legal review remain outstanding. The 11-point release preflight reports only 3 present.

## Additional risk statements

Seven core/PDF-layout tables have RLS source policies, **not** complete database-wide RLS. An application that can execute arbitrary tenant-context-setting SQL could change its own tenant setting; PostgreSQL policies are defense-in-depth, not a replacement for application authorization, injection protection and carefully minimized runtime grants. Production runtime roles must not use the broad disposable CI grants. A passing v0.59 contract alone cannot authorize commercial or personal-data deployment.

**GO/NO-GO: NO-GO until all real integration, infrastructure, security and legal checks are independently evidenced.**
