# AssetTrust v0.67 — Engineering Handover

**Date:** 12 November 2026  
**Base:** `AssetTrust_v66_Continuous_RLS_and_Two_API_Readiness_Checkpoint.zip`  
**Status:** Offline source and unit verification PASS; authentic dependency installation and live integration BLOCKED.  
**Production release decision: NO-GO.**

## Engineering changes delivered

1. New framework-free `apps/api/src/contexts/platform/domain/readiness-coordinator.ts` implements **single-flight** asynchronous coordination. Concurrent `/readyz` callers share one *in-progress* inspection, reducing duplicate PostGIS/schema/RLS catalog queries under bursty health polling. A completed or rejected inspection is **never cached**; the next request recomputes schema and security from the database. It does not weaken v0.66's continuous policy-drift detection.
2. `apps/api/src/contexts/platform/infrastructure/schema-probe.ts` now delegates concurrent calls to the coordinator while preserving the existing 27 checksum-verified migrations, required PostGIS tables, restricted runtime database role, 16 policy definitions and 13 FORCE-RLS table contract. Database failures remain fail-closed and are not exposed to the caller.
3. New pure frontend transport contract `apps/web/src/readiness-contract.ts` rejects legacy/incomplete `readyz` payloads, wrong API identity, unverified schema/security fields, malformed version, nonpositive or invalid migration/policy counts. It returns only an allowlisted verification object.
4. `apps/web/src/DeploymentReadinessPage.tsx` cancels earlier requests before starting newer probes; ignores stale network and integration updates after authentication role changes, request changes, or unmount; and uses an 8-second abort timeout for a hung readiness response. Optional third-party integration status is still independent of database readiness. No success or production approval can be inferred from the UI alone.
5. New v0.67 backend and frontend test suites verify concurrency, failure recovery, subsequent policy drift, strict transport parsing, privacy-safe errors, stale result rejection and request cancellation. Adapted the v0.65/v0.66 test-harness imports to include the new pure coordinator and let a source-derived version advance to v0.67 without weakening security logic.
6. Package/workspace versions were updated to `0.67.0`, `npm run verify:v67` was added, and the existing CI test step now runs it **after npm ci**.

No SQL migrations were added or modified. The source archive has no authentic `package-lock.json`, no vendored `node_modules`, no secret `.env`, and no original `.git` history. The full application build is not demonstrated by this checkpoint.

## Local verification evidence

- v0.67 test suite: **19/19 PASS**.
- Individual regression suites `verify:v41`–`verify:v67`: **27/27 PASS** (these are suite executions, not 27 production flows).
- Architecture / TS+TSX transpilation (107 source files) / Vite import graph / CI workflow policy checks: **PASS**.
- Pure TypeScript v0.67 modules independently typecheck with global `tsc --noEmit --strict` in this offline environment. **This is not a full API/Web build.**
- Limited current-source credential scanner: **PASS** with 0 high-confidence matches in 3,034 files. No original history scan.
- `npm run build`: **FAILED/BLOCKED** because this source archive has no reviewed lockfile or installed NestJS/Node dependencies; no end-to-end production bundle was produced.
- `npm run release:preflight:v51`: **BLOCKED** because an authentic reviewed `package-lock.json` is missing.
- No PostgreSQL/PostGIS server, valid restricted role, ClamAV, external registries, browser acceptance, live two-API run, penetration test, or backup/restore drill available here.

## Critical next acceptance action on connected Kali

Run `V67_KALI_VALIDATION.md` on a trusted connected machine against a **fresh loopback `assettrust_test` or `assettrust_ci` database only**. Generate and review the authentic lockfile only if absent, `npm ci`, run `npm run build`, verify built assets, and run guarded PostgreSQL and two-instance authentication/RLS checks. Preserve redacted first-failure evidence. Do not bypass a failing gate.

**Next engineering milestone (v0.68):** Remediate the first genuine Kali compilation, PostGIS, authentication or browser E2E failure and validate deployment/rollback. Do not add speculative modules before obtaining live evidence.
