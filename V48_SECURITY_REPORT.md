# AssetTrust v0.48 — Security engineering report

**Date:** 11 November 2026  
**Release decision: NO-GO — development checkpoint, not approved for customer data.**

## Scope and implemented controls

This checkpoint extends the staged PostgreSQL row-level security rollout from three private PDF-layout tables to **one more table: `public.case_evidence`**. Migration `023_case_evidence_rls.sql` enables `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, with a tenant equality policy on `organization_id` for reads and writes. A missing `assettrust.tenant_id` setting denies ordinary non-bypass runtime roles. This is tenant isolation **within this table**, not whole-platform RLS or a replacement for case-level permission checks.

The authenticated evidence submit/list workflow, case-report dashboard, report issuance snapshot, and current evidence-review repository were updated to set a validated tenant context with parameterized `set_config('assettrust.tenant_id',$1,true)` **inside their own PostgreSQL transactions**. Runtime production checks now require RLS/FORCE RLS on four protected tables and reject superuser/BYPASSRLS privileges and ownership of protected tables. Earlier migrations are unchanged.

Migration 022's composite foreign keys are retained, providing cross-tenant relationship integrity for core assets, cases, evidence and documents. CI adds a v0.48 version test and a disposable PostgreSQL contract which creates synthetic two-tenant fixtures, switches to a non-owner/non-bypass role, and checks missing-context denial, cross-tenant read/update denial, forbidden insert and cleanup. That database contract has **not been run** in this environment.

## What remains unprotected or unverified

1. **Not full core RLS.** `assets`, `verification_cases`, `documents`, `users`, and other private tables still lack database-enforced RLS; they currently rely on application-layer predicates, RBAC and prior FK constraints. Tenant RLS alone also does not enforce which *individual* users within a tenant can view evidence.
2. **Live database unverified.** PostgreSQL/PostGIS and an installed `pg` dependency were not available. No production migration or database test was executed. Test scripts require a disposable localhost database and explicit authorization.
3. **No clean build.** The archive has no authentic `package-lock.json` or installed npm dependencies. `npm run build` fails on missing project dependencies; transpile-only syntax is not type checking.
4. **No deployment/security-operation proof.** Authenticated browser journeys, concurrent multi-API download tests, SSL/HTTPS, firewall/SSH, malware scanning, backup restoration, risk-package remediation, historical Git secret scanning, signing-key custody and independent adversarial testing remain release gates.
5. **RLS assumption.** A PostgreSQL custom session GUC is not an independent identity proof: arbitrary SQL execution could change it. Strong input handling, parameterized queries, least privilege, no SQL injection, and protected DB network remain necessary. A privileged database role can bypass RLS.
6. **Compatibility.** Do not apply migration 023 while an older API instance is handling evidence queries. Older versions do not set tenant context and can return no evidence or fail after the policy is enabled. Validate a coordinated deployment and rollback plan, including database backups.

## Verification results

| Gate | Result |
| --- | --- |
| v0.48 offline security unit/contract tests | **9/9 pass** |
| Historical + current version command matrix, v0.03–v0.48 | **46/46 pass**, final corrected source |
| Architecture, syntax and CI-completeness checks | **3/3 pass** |
| TypeScript/TSX syntax-only scan | **102 files, zero diagnostics** |
| Migration source SHA-256 manifests | **23/23 match** |
| Current source high-confidence secret scanner | **1,859 files, zero findings**; not Git-history proof |
| Live PostgreSQL RLS contract | **NOT RUN**; guarded refusal tested |
| Full API/web compile and clean npm install | **BLOCKED/FAILED** because dependencies/lockfile absent |
| Release preflight | **NO-GO: 3 of 11 prerequisites present** |

See `TEST_EVIDENCE_V48.md` for commands and files and `V48_KALI_VALIDATION.md` for safe validation. No claim is made that the application is unhackable or production approved.
