# AssetTrust v0.49 - Security implementation and release report

**Date:** 11 November 2026  
**Classification:** Development checkpoint / security engineering  
**Release decision:** **NO-GO - no production customer data**

## Implemented changes

- Migration 024 enables and forces PostgreSQL RLS for `assets` and `verification_cases`, using organization-scoped `USING`/`WITH CHECK` rules. These join the earlier 3 PDF layout administration tables and case evidence table: six protected RLS tables **in source**.
- The new `Database.tenantQuery` opens a transaction and sets a validated, parameterized tenant context before executing queries. Protected queries in asset/case, document, dashboard, operations, geospatial, access and report paths now use transaction-scoped context.
- Public report verification first resolves a tenant through an existing opaque report ID; it does not accept the organization ID from public input.
- A production startup guard now checks six RLS tables and disallows superuser/BYPASSRLS/owner roles, with the previous application-level authorization retained.
- Added guarded PostgreSQL A/B tenant test, read-only SQL audit, CI coverage and regression tests.

## Executed offline checks

| Check | Result |
|---|---|
| New v0.49 tests | **9 / 9 PASS** |
| Version suites v03-v49 | **47 / 47 PASS** |
| Architecture | **PASS** |
| CI static completeness | **PASS** (47 suites; 23 PG contracts declared) |
| TypeScript/TSX syntax-only scan | **PASS**, 102 files / 0 diagnostics |
| SQL migration SHA-256 fingerprints | **24 / 24 MATCHED** |
| Snapshot secret scan | **PASS**, 1,923 files, zero high-confidence findings; not Git-history proof |
| ZIP integrity and SHA-256 | **PASS** after package assembly |

**These checks do not prove application compilation or live enforcement.** Earlier regression test harnesses were updated to understand scoped query dependencies while retaining permission and privacy assertions.

## Blockers and unverified controls

1. **Dependency and build:** genuine npm lockfile and installed dependencies missing; full build failed on missing NestJS/Node modules. Preflight only **3/11** prerequisites present.
2. **Live PostgreSQL:** migration 024 and the guarded two-tenant test have **not been run** against a real disposable database. Only the refusal behavior was executed without authorization.
3. **Tenant coverage:** documents, users, sessions, membership, audit and numerous other tables are not protected by new core RLS policies; app-layer RBAC remains necessary.
4. **Operations and infrastructure:** no verified application runtime DB role, HTTPS/SSH firewall tests, real browser flows, deployment concurrency, malware scan, dependency vulnerability remediation, backups/restoration or penetration testing.
5. **Repository:** checkpoint ZIP has no full `.git` history. Current-source scanning does not replace full historical scanning and secret rotation.

## Risk and release decision

RLS here is a second barrier against missing tenant WHERE clauses, not a replacement for authorization or SQL-injection prevention. Custom PostgreSQL tenant settings can be manipulated by someone with arbitrary SQL execution; strong SQL parameterization, least privilege and DB network isolation remain critical. Do not deploy migration 024 while old API instances are live. Back up and test restores before migration.

**NO-GO**. Approve a future pilot only after the clean build, live PostgreSQL and browser tests, complete security audit, and any critical/high remediation have documented passing evidence.
