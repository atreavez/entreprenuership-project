# AssetTrust v0.63 - Change log

**Date:** 11 November 2026  
**Source version:** `0.63.0`  
**Release status:** Development checkpoint; **production NO-GO**

## Production startup policy verification

- Added a framework-independent `rls-policy-contract.ts` identifying the expected 16 row-level-security policies on 13 sensitive PostgreSQL tables.
- Startup now queries the real `pg_policies` catalog after verifying the restricted PostgreSQL role and `FORCE ROW LEVEL SECURITY` flags. It refuses to start when a required policy is missing, extra, duplicated, assigned to an unexpected role, or has an altered read/write/recipient expression.
- User-private notifications are explicitly checked for *both* tenant and authenticated recipient constraints. Policy expressions are checked after only PostgreSQL presentation casts, whitespace and parentheses are normalized; a changed SQL operator or function fails the assertion.
- Added a separate, read-only live PostgreSQL checker that runs using the restricted runtime login on an expressly confirmed disposable local database.

## CI build correctness

- The v0.61-v0.63 suites require `typescript`; moved them from the **pre-`npm ci`** sequence to the post-install unit test sequence, fixing a clean-runner failure.
- Live PostgreSQL policy inventory is now required in CI before tenant-data fixtures. The supervised release plan also requires it and enforces explicit confirmation.

## Verification

- **31/31 new v0.63 tests passed**, including simulated calls to the production `Database.onModuleInit` startup method.
- **61/61 version suites passed** for v0.03-v0.63; standalone logs are in `test-evidence/v63/version-suites/`.
- Architecture, TypeScript source-transpilation syntax, CI YAML policy, source entry, migration fingerprints and high-confidence source secrets scan passed.
- **27/27 SQL migrations unchanged** relative to v0.62. No database migration in this milestone.
- `npm ci`, the full build, live PostgreSQL, ClamAV, authenticated browser and external deployment checks did **not** pass or run here due to missing prerequisites.

**Important limitation:** A matching policy catalog does not prove the live rules enforce isolation under actual authenticated operations. Earlier live two-organization checks, non-owner runtime restrictions, and an independent security audit remain mandatory. Only approved DB administrators should be able to alter these policies.
