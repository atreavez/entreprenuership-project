# AssetTrust v0.74 — Engineering handover

**Date:** 12 November 2026  
**Base checkpoint:** v0.73 (no project reset)  
**Release decision:** **NO-GO**. Source-level security regression has passed, not live runtime acceptance.

## Development delivered

The v0.73 transactional encrypted-document read prevented grant revocation races at download time, but neighboring list/administrative paths still used `UserAuth.role` from a JWT. A formerly active ORG_ADMIN could retain a previously signed role claim until the token expired. Version v0.74 closes this specific privilege-staleness gap for **document listing** and **asset access-grant administration**.

1. `DocumentsService.list()` now joins a currently active organization member in the same tenant-scoped SQL statement. Visibility depends on `actor.role` from PostgreSQL; suspended/deleted users obtain no list. Case attachments remain visible only to assigned/creating participants or current organization admins; asset-grant readers cannot view a confidential case attachment.
2. `requireCurrentOrganizationAdmin(tx, actor)` verifies an active organization administrator via a row-locking `SELECT ... FOR SHARE` in the same transaction as privileged work. Updates that suspend/demote that user must serialize with the grant transaction.
3. `AccessController`'s **list/create/revoke** grant endpoints now use the above guard after `setTenantScope()`. The code rechecks the target asset's tenant and active grantee membership before writing grants. Grant mutations and immutable audit records remain in the same transaction.
4. Added `tools/tests-v74/current-membership-v74.test.cjs`, covering stale admin claims, suspension, locked membership, cross-organization assets, inactive grantees, authorization ordering, document listing and confidential cases. Legacy v49 and v73 fixtures were adjusted to recognize the stronger implementation without bypassing security expectations.
5. Registered `verify:v74` in package scripts and CI; root, API and web packages are versioned `0.74.0`.

**Files changed:** `apps/api/src/access.ts`, `apps/api/src/documents.ts`, `apps/api/src/contexts/access/infrastructure/transactional-access.ts`, `package.json`, `apps/api/package.json`, `apps/web/package.json`, `.github/workflows/ci.yml`, `tools/tests-v49/assets-cases-rls.test.cjs`, `tools/tests-v73/*.test.cjs`, `tools/tests-v74/current-membership-v74.test.cjs`, plus this milestone's documentation/evidence.

## Verification and remaining limitations

- New tests: **19/19 passed**. Prior v0.73 tests: **31/31 passed**.
- Regression suites from v0.41 to v0.74: **34/34 passed, 574 counted TAP passes**. Individually captured in `test-evidence/v74/version-suites/` and the JSON matrix.
- Architecture, syntax transpilation (108 files), CI policy and static build-source preflight: passed. These are NOT full builds or a proof of security.
- SQL migrations: 27 existing files, no changes; approved `pg_policies` contract unchanged.
- Limited source credential snapshot: **3,399 files scanned, zero high-confidence findings** at inspection time. The original Git history could not be inspected because this source checkpoint lacks `.git` metadata; the strict v54 history scan appropriately returned failure.
- Authentic npm lockfile is absent, so `release:preflight:v51` remains BLOCKED. `npm run build` cannot compile because genuine Node/NestJS packages are not installed; this environment has no PostgreSQL or Docker daemon. **No live database concurrency or authenticated browser verification was performed.**

## Security caveat

This milestone fixes the specified **grant-admin and document-list** paths only. Other endpoints may still use stale JWT roles (for example, general asset listing/creation), and must receive a platform-wide authorization audit. The in-memory PostgreSQL mocks verify call ordering and refusal behavior, **not real locks** or concurrency under load. Do not treat an isolated unit test result as production certification.

## Next execution on Kali

Use `V74_KALI_VALIDATION.md` and the trusted Git repository with an authentic reviewed lockfile. Never paste credentials or raw log files. Run the supervised disposable PostGIS/ClamAV acceptance, test demotion/suspension against active session tokens and verify real concurrent privilege revocation with two database connections; then remediate all observed errors. The independent final security hardening and release gate remains mandatory.
