# AssetTrust v0.63 - Independent engineering security assessment

**Scope:** Source from AssetTrust v0.62; 11 November 2026. This is an engineering validation, not an independent penetration test or production certification.

**Verdict: NO-GO** for production, real asset/land documents or payment processing.

## Finding: RLS policy drift was not checked at startup

Prior startup verification asserted protected-table RLS flags and a non-owner, non-superuser runtime account. PostgreSQL can combine permissive policies with OR logic, so a rogue permissive policy can weaken tenant restrictions while those flags remain enabled. This would not be caught by the previous startup check.

**Remediation in v0.63:** A reviewed 16-policy catalog contract is checked against live `pg_policies` before the API accepts requests in production or guarded CI mode. The expected catalog covers 13 tables, including recipient-only notification SELECT/UPDATE and tenant-only INSERT. Unexpected policies, policy command/role changes and altered expressions produce a startup failure.

**Residual risk:** A privileged database owner can manipulate tables and policies. The expression-normalization approach intentionally rejects changed operator and function tokens but is not an independent SQL proof engine. No live catalog or negative tenant-isolation run took place in this environment. Actual PostgreSQL permission grants, public schema access, and all other sensitive tables require further scrutiny.

## Finding: CI invoked TypeScript-dependent suites before installing TypeScript

v0.61-v0.63 regression suites import `typescript`; running them in the pre-`npm ci` step can fail on a clean GitHub runner. Those suites now run after installation, while lockfile and dependency-free checks remain before installation.

## Evidence

- **31/31:** v0.63 new tests passed.
- **61/61:** v0.03 through v0.63 version suites passed with individual test logs.
- **27/27:** migration source checksums unchanged from v0.62.
- Architecture, source transpilation, GitHub Actions YAML checks, source-entry graph and source secret pattern scan passed.
- **0 high-confidence matches** in **2,939 inspected source files** by the limited current-source scanner; this is not a full Git-history or independent leak audit.
- **3/11 release prerequisites present** in read-only preflight.
- `npm ci --offline`: **BLOCKED**, authentic package-lock.json absent.
- `npm run build`: **FAILED**, missing TypeScript Node definitions and installed NestJS/other dependencies.
- `npm run test:pg:policy-contract:v63`: **BLOCKED**, no explicitly approved disposable database credentials / daemon.

## Critical next gates

1. Generate and review a genuine npm lockfile on a trusted connected Kali machine; run `npm ci`, dependency audits, API and web build.
2. Backup and test-restore staging, migrate there, then verify policy catalog and v57-v62 restricted runtime/tenant tests under the real PostgreSQL engine.
3. Verify antivirus clean/infected upload handling, authenticated admin/user/browser flows, multi-instance race cases, TLS, secret history scan, admin MFA and audit integrity.
4. Resolve all critical/high security findings and obtain independent go/no-go approval.

**Decision:** Release remains blocked. A passing offline policy test does not establish live tenant isolation or operational readiness.
