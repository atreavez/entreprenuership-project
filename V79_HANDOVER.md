# AssetTrust v0.79 — Engineering handover

**Date:** 12 November 2026  
**Base:** Complete v0.78 source checkpoint  
**Status:** Development checkpoint; **PRODUCTION NO-GO**.

## Delivered changes

1. **Dashboard overview — current authority.** `DashboardService.summary` no longer uses `u.role==='ORG_ADMIN'` as a privilege bypass. It sets the tenant context, locks the currently active `users` row with `FOR SHARE`, obtains the current role from PostgreSQL and performs all four dashboard reads in the same transaction. A demoted user receives participant-scoped statistics; a suspended user receives no statistics.
2. **Case summary reports — confidentiality and revocation.** `DashboardService.report` no longer performs a separately committed preflight permission check. Within one transaction it sets tenant scope, locks/verifies current case participation via `requireCurrentCaseRead`, reads the case, reads private case evidence, and retrieves the organization publication text. A concurrent permission change must serialize with this read boundary.
3. **Audit history and chain verification — live administrator check.** `AuditService.verify/list` lock active administrator membership in the same tenant-scoped transaction as the audit ledger read. The hash-chain calculation, bounded listing and original append-only audit writes remain unchanged.
4. **Integrations views — live administrator check.** The `local-proof` and `status` routes no longer trust an older token's role. `local-proof` reads the audit head only after a successful transaction-local current administrator check. Status values remain explicitly **NOT_CONNECTED** for government registries, blockchains, payments and maps; no integration capability is invented.
5. **CI/tests.** New `tools/tests-v79/current-admin-read-v79.test.cjs` runs code transpiled from actual TypeScript against a transaction-recording fake and verifies denial, data-scope decisions and read order. Older v0.48–v0.50 and v0.61 fixtures were updated to assert the stronger tenant-scoped transaction design, not to waive isolation checks. `npm run verify:v79` is registered and CI-enforced.

## Verification performed in this package

| Evidence | Outcome |
|---|---|
| New v0.79 tests | 23 / 23 PASS |
| Full v0.41–v0.79 matrix | 39 / 39 PASS; 718 passing TAP tests |
| TypeScript transpilation preflight | 109 TS/TSX files; zero syntax diagnostics; **not** a compiler typecheck |
| Architecture policy | 3 / 3 PASS |
| Source imports | 106 files, 296 relative imports, PASS |
| CI workflow policy | PASS; 77 version scripts and 33 PG contract scripts |
| Limited snapshot secret scan | PASS; 3,533 files, zero high-confidence matches; original Git history untested |
| npm registry | Unreachable here: EAI_AGAIN |
| Genuine npm lockfile | Absent; `npm run lockfile:check:v55` FAIL |
| Real `npm run build` | FAIL due missing NestJS, typings and other installed dependencies |
| Live API/DB/browsers | Not run |
| Mandatory final release security gate | NO-GO |

No genuine `package-lock.json` or successful compiled output was fabricated. SQL migrations, RLS policies, prices, payments, document crypto, tenant definitions and the Platform Super Admin scope are unchanged. The source-level checks cannot prove a working deployment.

## Changed code paths

- `apps/api/src/dashboard.ts`
- `apps/api/src/audit.ts`
- `apps/api/src/integrations.ts`
- `apps/api/src/contexts/access/infrastructure/current-read-authority.ts` (new)
- `tools/tests-v79/current-admin-read-v79.test.cjs` (new)
- Reviewed compatibility assertions in `tools/tests-v48/`, `tools/tests-v49/`, `tools/tests-v50/`, `tools/tests-v61/`, `tools/tests-v75/`.
- Workspace manifests, `.github/workflows/ci.yml`, new v0.79 docs/README/changelog.

## Required next action

Run the genuine lockfile/bootstrap and build workflow on connected trusted Kali, inspect actual TypeScript compiler errors and fix them. Then use the disposable PostGIS environment and restricted runtime roles from v0.70–v0.78 to run complete authenticated, cross-organization, document-revocation, admin MFA, dispute and dashboard/audit verification against real PostgreSQL. Independently scan full Git history and complete the final release security gate. Do not deploy while critical blockers remain.
