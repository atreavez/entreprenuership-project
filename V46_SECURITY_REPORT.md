# AssetTrust v0.46 - Security implementation and release decision

**Audit date:** 11 November 2026  
**Checkpoint:** v0.46  
**Production decision:** **NO-GO - DO NOT DEPLOY WITH CUSTOMER DATA**

## Executive summary

v0.46 introduces a staged, database-enforced tenant isolation layer for the three private PDF-layout administration tables only. Each protected table has an organization-scoped PostgreSQL RLS `USING` and `WITH CHECK` policy, both ENABLED and FORCED. The application sets an authenticated, validated tenant UUID using a parameterized, transaction-local PostgreSQL session setting before all covered operations. Production application startup refuses database roles that can bypass or disable these controls. Old migration files and report evidence have not been changed.

This is **partial tenant RLS**, not certification that every tenant's information is database-isolated. Remaining protected data domains require their own policies and integration tests. RLS also cannot stop a database superuser or arbitrary-SQL compromise on its own.

## Implemented and offline-verified

| Area | Outcome | Evidence |
| --- | --- | --- |
| Three layout tables | ENABLE + FORCE RLS and organization-matched read/write policy | Migration `021_pdf_layout_rls.sql`; tests-v46 |
| Transaction-scoped access | Tenant UUID validated and supplied only as bind parameter | `tenant-policy.ts`, `tenant-scope.ts`; tests-v46 |
| Admin routes | List/propose/decide/export establish tenant context after fresh MFA authorization | `report-layout.module.ts` |
| Recipient export | Approved share's organization controls private layout query | `report-sharing.module.ts` |
| Runtime DB-role safety | Production rejects superusers, BYPASSRLS, elevated roles, owner and missing FORCE RLS | `database.ts`; dynamic tests-v46 |
| Offline version suites | 44/44 version commands (v03-v46) passed in logged runs | `test-evidence/v46/verify-v*.log` |
| New v0.46 tests | 13/13 passed | `test-evidence/v46/verify-v46.log` |
| Architecture, CI coverage, syntax | Passed; 102 TS/TSX files transpile, not a full build | `verify-architecture.log`, `verify-ci-v41.log`, `verify-syntax.log` |
| Migration manifest | 21/21 SQL fingerprints match pinned values | `release-preflight.log` |
| Snapshot secret scanner | 1,726 files scanned; no high-confidence matches | `secret-snapshot-scan.log` |

## Not verified / release blockers

1. **Database-wide tenant isolation:** RLS applies to three PDF-layout tables, **not** assets, cases, documents, users, evidence, payment data and other sensitive records. Live adversarial tenant testing is required.
2. **Actual PostgreSQL:** The new guarded RLS test script is present but cannot run here because no PostgreSQL service and project `pg` dependencies are installed.
3. **Runtime database roles:** A distinct least-privileged production DB account has not been provisioned on your server. Verify role membership, grants, TLS and network access.
4. **Reproducible build:** No reviewed `package-lock.json`, installed NestJS/React/pg dependencies, or compiled frontend/backend. The attempted build failed on missing dependencies; no claim of successful compilation.
5. **Git-secret remediation:** No `.git` history in the ZIP. An independent full-history scan and any necessary key rotations remain outstanding.
6. **Security finalization:** Dependency vulnerabilities, file malware scanning, HTTPS/SSH/firewall, actual login/reset email, CSRF/cookies, payment authority, admin privileges, backup/restore, two-instance concurrency, authenticated browser and penetration tests are unverified in this checkpoint.

## Security decision

**NO-GO**. New RLS policies are implemented in source but not operationally proven. A full release still requires evidence for the entire cross-project finalization standard, acceptance tests for every protected data domain, deployment and infrastructure review, and resolution of critical/high findings. AssetTrust is a non-official evidence verification product, not an official land registry.
