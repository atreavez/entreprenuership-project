# AssetTrust v0.65 — Trusted Readiness & Runtime Diagnosis Milestone

**Date:** 11 November 2026  
**Based on:** `AssetTrust_v64_Runtime_Integration_Evidence_Checkpoint.zip`  
**Release:** **ENGINEERING CHECKPOINT — PRODUCTION NO-GO**.

## Delivered code changes

1. **Real backend schema-readiness evidence.** `apps/api/src/contexts/platform/infrastructure/schema-probe.ts` returns `verifiedMigrations` **only** when the running PostGIS database has the complete expected schema and every migration's recorded checksum exactly matches its source manifest. Missing tables, missing/extra/changed migrations, PostGIS failure and SQL errors remain fail-closed. `apps/api/src/main.ts` now reports a running API version and the verified migration count in `/api/v1/readyz`, but only after readiness was confirmed. No passwords, paths, DB identifiers or row content are returned by this API field.
2. **Corrected production-readiness UI.** `apps/web/src/DeploymentReadinessPage.tsx` no longer hardcodes an obsolete `v0.11` badge or an inaccurate claim that only seven migrations are verified. It displays values received from the live API (or clearly marks the migration count unverified). Failure of the optional, role-restricted integration-status request cannot falsely change a successful PostgreSQL/PostGIS readiness check into `NOT_READY`.
3. **Non-mutating, credential-safe Kali diagnostics.** New `tools/runtime-diagnostics-v65.cjs` provides `--inspect` and `--write`. The tool reads *local files only*, computes SHA-256 of all 27 source SQL migrations against the pinned TypeScript manifest, checks workspace version equality, and identifies missing dependency/build/Git/client/scanner prerequisites without opening network/database connections or outputting environment values. `--write` creates a `0600` report; directory and output symlink attacks are rejected.
4. **Regression tests and CI.** New `tools/tests-v65/readiness-v65.test.cjs` exercises actual transpiled domain/infrastructure readiness code with simulated database outcomes, hash-tamper negatives, file-security behavior, UI-accuracy invariants and CI integration. All three workspace versions are `0.65.0`; `verify:v65` is part of the installed-dependency CI verification section.

## No-go and safety boundaries

- This milestone does not change any of the 27 SQL migrations, 13 RLS-protected tables, 16 reviewed RLS policies, application permission models, stored secrets, payment correctness or legal registry integration.
- Source hash consistency is **not** a PostgreSQL database test; simulated DB tests are **not** evidence of an actual live PostGIS connection.
- The new readiness UI is an engineering diagnostic, **not** an official land-title verdict, independent security certification or release approval.
- No verified package-lock.json, npm dependency tree, PostgreSQL instance, ClamAV service, original `.git` history, live HTTP/browser sessions or deployment TLS were available in the offline working container.
- The v0.64 supervised integration runner remains the supported path for build/DB evidence. It deliberately requires an authentic reviewed lockfile, separate restricted role, disposable loopback DB and explicit stage confirmations. **Never** make these tests point at production/customer data.

## Tested here

- `npm run verify:v54` through `npm run verify:v65`: 12/12 command suites exit 0, with test counts 15,16,20,20,15,15,15,16,18,31,15,16 respectively (212 test cases across those suite invocations; do not treat as 212 unique live tests).
- `npm run verify:architecture`: 3/3 PASS.
- `npm run verify:syntax`: 105 TS/TSX files transpile with 0 syntax diagnostics; **not** a typecheck.
- `npm run build:source:v56`: PASS, static 102-source/285-import check; **not** a production Vite/Nest build.
- `npm run verify:ci:v41` and `npm run verify:ci:v53`: PASS, 63 declared version scripts and 31 PostgreSQL contract entries covered.
- v0.65 migration source hash audit: 27 of 27 original files agree with pinned manifest.

## Recommended next milestone: v0.66

Obtain and triage the first **actual** connected-Kali `npm ci`, `npm run build`, local PostGIS/role and browser acceptance failures using `V65_KALI_VALIDATION.md`. Implement fixes against logged reproductions, retain redacted proof, then retest negative authorization/tenant/MFA and version-aware readiness in two API instances. Do not infer that any currently blocked live gate has passed.
