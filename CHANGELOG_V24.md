# AssetTrust v0.24 — Transactional Case-Evidence Authorization

Compiled by: Aturinzire Hargreave

## Scope
This checkpoint hardens the pre-existing verification case flow rather than adding UI features. It preserves DDD, TDD, SOLID, Clean Architecture and security-by-design.

## Changes
1. New infrastructure-only `requireCurrentEvidenceSubmission` authorizer locks a verification case (`FOR UPDATE OF c`), current actor membership/role (`FOR SHARE OF actor`) and current professional accreditation (`FOR SHARE`) in the SAME transaction as inserting evidence.
2. Reject evidence submissions after reassignment, current-role change, case closure/stage change, professional accreditation revocation or expiry, or unauthorized final review.
3. Case creation now rechecks asset contribution grants inside its transaction using the v0.23 access adapter. Added optional current-role constraints (`ORG_ADMIN`, `CLIENT`, `REVIEWER`) to prevent stale roles from creating cases.
4. 16 new offline behavioral/unit tests cover the real `CasesService.evidence` and `CasesService.create` methods with controlled transaction substitutes, domain authorization, locks, and schema alignment.
5. Added an explicit disposable, rollback-only PostgreSQL authorization exercise and CI step. Not run in this environment.
6. Added isolated strict TypeScript verification for the new authorizer and previous transactional access adapter.
7. CI now runs v0.24 tests and the disposable PostgreSQL exercise (only after real build and migrations).

## Release status
**NOT PRODUCTION READY.** The authentic npm `package-lock.json` remains absent. The complete application build failed with missing runtime/type dependencies (`TS2307`, `TS2688`). npm registry DNS access returned `EAI_AGAIN`. No PostgreSQL/PostGIS or full browser integration test was performed here.

Do not interpret evidence acceptance or verified hash as legal title, a government land registry record, or ownership adjudication.
