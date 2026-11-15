# AssetTrust v0.77 — Engineering handover

**Date:** 12 November 2026  
**Base:** Full v0.76 source checkpoint (incremental upgrade, no reset)  
**Release:** **NO-GO**, source-level verification only.

## Delivered engineering change

The former dispute resolution logic cleared an asset's `FLAGGED` status when the *current case* no longer had unresolved disputes. That was unsafe when multiple verification cases concerned the same asset. The v0.77 implementation in `apps/api/src/operations.ts` now checks unresolved disputes across **all cases of the same tenant-scoped asset**, while holding a row-level `FOR UPDATE` lock on the asset.

Both `raiseDispute` and `resolveDispute` now take locks in the common order **asset → case → dispute**. The new `lockCurrentDisputeAsset` in `apps/api/src/contexts/access/infrastructure/transactional-access.ts` makes an initial current-user/participation check and locks the specific asset. The subsequent case or admin authorization is still performed within the very same transaction. Reassignments discovered between the preflight locator and case lock fail closed instead of writing to an unlocked asset.

An asset remains `FLAGGED` if another one of its cases contains an `OPEN` or `INVESTIGATING` dispute. The case itself may reopen when it has no pending disputes. Once the last unresolved dispute for that asset is finalized, the asset may return to `IN_REVIEW`, subject to the existing status precondition. Existing audit behavior, tenant-scoped SQL, routes, and source architecture are preserved.

## Verification in this environment

- **New v0.77 source regression:** 34/34 passed, consisting of 22 source/service tests and 12 wrapper/guard tests.
- **Red control:** 16 of 22 cross-case tests failed against the unchanged v0.76 snapshot; all 22 pass with v0.77.
- **v0.41–v0.77 matrix:** 37/37 version-script runs pass with a total of **665 counted TAP successes**. The v0.75 compatibility fixture was updated to recognize v0.77; 36 scripts passed in the batch and v0.75 subsequently passed individually. These numbers are not real HTTP acceptance counts.
- TypeScript/TSX syntax preflight: 108 source modules transpiled, zero syntax diagnostics (not a full typecheck).
- Architecture suite: 3/3 PASS. CI workflow policy validator: PASS (75 version scripts, 32 PostgreSQL contracts).
- Limited current-source secret scan: PASS, 3,517 files, zero high-confidence matches. This does not inspect the full original Git history.
- `package-lock.json` **ABSENT**; release preflight **BLOCKED** and `npm ci` cannot be run here.
- Full application compilation **FAILED/BLOCKED** due to missing installed NestJS, TypeScript type packages and Argon2 dependencies. This does not prove no other compilation errors exist.
- PostgreSQL/PostGIS runtime, restricted-account real tests, ClamAV, browser and HTTP acceptance **NOT EXECUTED** here.

## Executable guarded PostgreSQL acceptance

`tools/e2e-pg-cross-case-disputes-v77.mjs` loads the actual `OperationsService`/transactional permission source via TypeScript transpilation in a minimal test host (not a fully booted NestJS API). It creates synthetic fixtures in the **explicitly authorized disposable local database** using the operator login and then invokes the real service with the **separate non-superuser/non-BYPASSRLS runtime login**. The scenarios test across-case flag preservation, final clearance, concurrent dispute creation and resolution, and cleanup. It does not substitute for live HTTP or actual browser tests.

`tools/kali-pg-disputes-v77.cjs` loads the private v0.70 credentials without echoing them. Both explicit opt-ins are required before starting any DB operation. Failure output is reduced to high-level status. The CI workflow requires the v0.77 offline suite and live test after provisioning the restricted role.

## Files changed

- `apps/api/src/operations.ts`: shared asset lock, asset-wide unresolved-dispute gate, asset reassignment defenses.
- `apps/api/src/contexts/access/infrastructure/transactional-access.ts`: `lockCurrentDisputeAsset`, checked `assetId` returned by case mutation.
- `tools/e2e-pg-cross-case-disputes-v77.mjs`: disposable real PostgreSQL concurrent service acceptance.
- `tools/kali-pg-disputes-v77.cjs`: guarded private Kali execution.
- `tools/tests-v77/*.test.cjs`: 34 tests; historical v0.75/v0.76 fixtures updated for current source compatibility.
- `package.json`, `apps/api/package.json`, `apps/web/package.json`, `.github/workflows/ci.yml`, milestone docs.

**Unchanged:** 27 SQL migration files, existing RLS policy source, public routes, production data, blockchain anchors, payment integrations, security-finalization requirements.

## Remaining release blockers

1. Recover/generate and review a **genuine npm lockfile on connected Kali**, install with `npm ci`, resolve actual compile failures, run dependency audit.
2. Run v0.77 restricted-role PostgreSQL acceptance on disposable `assettrust_test`/`assettrust_ci` and address any errors found. Manual review of leftover synthetic data is required if cleanup reports failure.
3. Run real supervised API/browser and two-tenant workflows, admin MFA, report and document flows, payment authority, safe uploads/ClamAV, source-history secret scans and independent adversarial tests.
4. Complete the mandatory final security hardening and release gate with evidence and signoff. Critical findings block deployment.

This checkpoint is **not** a production-ready build, legal adjudication service, or proof of immutable legal title.
