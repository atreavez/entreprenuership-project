# AssetTrust v0.66 — Engineering Handover

**Date:** 11 November 2026  
**Base:** `AssetTrust_v65_Trustworthy_Readiness_and_Runtime_Diagnostics_Checkpoint.zip`  
**Checkpoint status:** SOURCE VALIDATED / LIVE DEPENDENCIES AND DATABASE BLOCKED  
**Production release decision:** **NO-GO**

## Scope: ongoing database-policy drift detection and two-instance acceptance

Previously, `Database.onModuleInit()` checked 13 RLS-protected tables and 16 reviewed PostgreSQL policies at application startup. A policy changed *after startup* could leave a running API reporting `readyz=200` as long as PostGIS and the migration ledger were correct. v0.66 closes that operational visibility gap:

1. `apps/api/src/database.ts` exposes `assertRuntimeIsolation()` as a **read-only live catalog check** covering runtime role privilege flags, table ownership, RLS + FORCE RLS flags, and the complete v0.63 policy predicate inventory. Production startup still calls it; each live readiness query now calls it again, even in development/test mode. A policy that drifts after startup turns the next readiness result into non-200.
2. `apps/api/src/contexts/platform/infrastructure/schema-probe.ts` checks PostGIS and the 27 exact migration ledger entries **before** checking the runtime isolation contract, and exposes counts only after both succeed. It uses a discriminated readiness result and sanitizes SQL failures.
3. `apps/api/src/main.ts` returns `security: rls-policy-contract-verified`, `rlsPoliciesVerified: 16` and `protectedTablesVerified: 13` only on a successful verified response, in addition to the existing migration count and version. The counts are drawn from live catalog verification, not hard-coded in the controller.
4. `apps/web/src/DeploymentReadinessPage.tsx` displays a new live isolation-policy status and **refuses to call a partial/legacy `readyz` result fully ready**. External integrations remain a separate readiness axis.
5. New `tools/two-api-readiness-v66.cjs` is an identity-bound, **read-only** HTTP contract checker for exactly two separately marked loopback test API instances. It checks each `/healthz` ownership marker before `/readyz`, forbids redirects and environment proxies, bounds response sizes/timeouts, validates the current source version/migration/policy counts and emits sanitized issue codes. It does not supply credentials or write to PostgreSQL. It cannot prove real Postgres without separate live evidence.
6. Existing `tools/e2e-two-api-v42.mjs` invokes the v0.66 read-only checker automatically when `ASSETTRUST_V66_HTTP_CONFIRM=YES`, while keeping its existing negative recipient tests. The CI two-API step sets this flag.
7. New dependency-installed test suite `npm run verify:v66` exercises real transpiled TypeScript domain/infrastructure logic, simulated policy changes, and live temporary **Node HTTP test servers**, including wrong versions, spoofed ownership, redirects and single-instance drift. CI checks it after `npm ci`.

## Verified locally (offline environment)

- `verify:v66`: **25/25** tests PASS.
- Every `verify:v54`–`verify:v66` command PASS: **13/13 suites, 237 case executions** (not distinct production tests).
- Architecture gate PASS; TS/TSX syntax gate PASS (105 files); source import graph preflight PASS (102 source files / 285 relative imports).
- CI YAML semantics and declared-version inventory checks PASS (64 version scripts, 31 PostgreSQL contract scripts declared).
- `release:preflight:v51` **BLOCKED** because no genuine `package-lock.json` exists.
- API TypeScript full build is **NOT VERIFIED**: absent node_modules / NestJS and Node types; npm registry unreachable from this offline container (`EAI_AGAIN`).
- No live PostgreSQL/PostGIS, ClamAV, authentic app HTTP/browser E2E, original Git history security scan, external official registry verification, backup/restore or infrastructure TLS evidence. No source SQL migrations changed.

## Limitations and security decisions

- Catalog snapshots are read-only and taken at **readiness-check time**; this cannot guarantee that a DBA does not change policy between checks. Use a restricted runtime role and managed database change approvals in production. A `readyz=200` is not full production approval.
- V0.66 does not turn on rate-free catalog polling or increase DB role privileges; it reuses the existing database pool and exact v0.63 policy contract. Every readiness call now performs extra catalog queries, so performance and probe frequency must be measured in staging.
- The standalone two-API HTTP tool only confirms identity and response contracts of local processes. It does not independently verify the actual PostgreSQL server; preserve v0.57–v0.63 negative SQL evidence, v0.42 recipient tests, and required backend/browser tests.
- Keep all mandatory DDD / Clean Architecture / SOLID / TDD, least privilege, immutable evidence, admin approval + audit, MFA, tenant isolation and release-security gates. No user/customer data or production DB may be used for synthetic fixtures.

## Next acceptance target

On **trusted connected Kali**, run `V66_KALI_VALIDATION.md`. Generate an authentic reviewed npm lockfile if missing, install dependencies, run actual API/web build, prepare disposable loopback PostGIS and restricted roles, run the v0.66 CI/supervised two-instance probes with real NestJS processes, collect **redacted first-failure logs** and fix real code/deployment defects. Keep production NO-GO until all mandatory release gates pass.
