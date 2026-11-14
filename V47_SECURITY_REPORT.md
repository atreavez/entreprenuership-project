# AssetTrust v0.47 - Security Implementation & Release Verdict

**Date:** 11 November 2026  
**Artifact:** `AssetTrust_v47_Core_Tenant_Integrity_Checkpoint.zip`  
**Decision:** **NO-GO - development checkpoint, no real customer data**

## Executive verdict

This release strengthens the database's enforcement of tenant relationships. Earlier code generally passed `organization_id` as an application filter and v0.46 enabled PostgreSQL RLS only for three private PDF-layout tables. In the core schema, a case or document could otherwise have a syntactically valid foreign key to another organization's asset or user, even though ordinary API paths tried to prevent it. Migration 022 now makes those mismatched relationships fail at the database layer.

**This is not database-wide RLS.** Raw reads of assets, verification cases, case evidence and documents are not universally restricted by migration 022. Production use is still forbidden pending live tests, RLS rollout, and final security audit.

## New controls

| Database record | Organization-aware relationships enforced |
|---|---|
| Assets | Asset creator must belong to asset's organization |
| Verification cases | Referenced asset, creator and optional assignee must belong to case's organization |
| Case evidence | Referenced case, recorder and optional reviewer must belong to evidence's organization |
| Documents | Referenced asset, case and uploader must belong to document's organization; when both asset and case are named, the asset must be that case's asset |

The migration includes four composite unique keys and eleven new composite FKs. It verifies all existing rows before commit. Unexpected historical inconsistencies trigger a migration failure and rollback; they are **not silently repaired**.

## Evidence

| Check | Result | Scope/qualification |
|---|---|---|
| New v0.47 tests | **10/10 PASS** | Static migration safety, completeness, manifest, CI, test guard and operator preflight |
| All historical/current versions | **45/45 PASS** | v0.03 through v0.47 offline commands, tested in current archive |
| CI completeness | **PASS** | 45 version suites and 21 declared PostgreSQL contracts statically covered |
| Architecture and TS syntax | **PASS** | 102 TS/TSX files transpile without syntax diagnostics; not a typecheck |
| Migration SHA-256 manifest | **22/22 MATCH** | Byte-for-byte planned migration files, not evidence of successful execution |
| Current source secret scan | **PASS**, 1,796 files | No high-confidence matches; **not** a Git-history scan |
| Unsafe live-test target | **REFUSED** | Guard rejects an unapproved database name prior to any database connection |
| Live PostgreSQL migration/FK test | **NOT RUN** | PostgreSQL and installed dependencies unavailable |
| Full API tests | **FAILED/BLOCKED** | Missing project dependencies; do not count as pass |
| Full production build | **FAILED/BLOCKED** | Missing Node/NestJS dependencies and genuine lockfile |
| Release prerequisites | **3/11 PRESENT** | Read-only preflight blocks production |

Evidence logs are in `test-evidence/v47/`; the redaction-safe test log captures no customer data.

## Remaining critical release gates

1. Verify backup **and restore** of the existing database, preserve encryption and signing keys, audit schema and execute migration 022 on a disposable cloned database before production change control.
2. Run `npm ci` using an authentic, reviewed `package-lock.json`, `npm test`, full API/web builds, and a current dependency security audit/SBOM.
3. Execute the v0.47 live FK contract against disposable PostgreSQL; verify catalog constraints and attempted cross-tenant inserts/updates, then validate legitimate complete case/document workflows.
4. Extend `FORCE ROW LEVEL SECURITY` to the remaining sensitive tables after every API query path, transaction, background worker and permitted public verification path has an independently reviewed tenant context.
5. Provision distinct migration owner and low-privilege runtime DB roles. Keep Postgres off public networks. Verify RLS doesn't leak through pooled connections or elevated roles.
6. Complete HTTPS/HSTS, CSRF/cookies, MFA, SSH/firewall, file malware scanning, signed reports, rate limits, password recovery relay, admin actions and payments with live tests.
7. Run full canonical Git-history secret scanning and rotate every confirmed exposed key. Perform independent security review and penetration testing before customer onboarding.

**Bottom line:** v0.47 offers valuable integrity protection, but production security status is still **NO-GO**. It does not justify raising the overall project completion percentage without verified live integration results.
