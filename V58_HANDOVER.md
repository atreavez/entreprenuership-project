# AssetTrust v0.58 engineering handover

**Status:** Offline-verified development checkpoint. Production **NO-GO**.

## Changes and boundaries

- Entry point: `tools/e2e-pg-runtime-tenant-isolation-v58.mjs` (seeded, disposable live PostgreSQL security contract).
- Preconditions are checked before loading `pg`: `CI=true`, `NODE_ENV=test`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES`, `ASSETTRUST_V58_SEEDED_RLS_CONFIRM=YES`; restricted runtime and operator URLs must be distinct but on the same loopback CI/test DB.
- Two separate PostgreSQL connections are used, with synthetic committed records for 2 organizations in `assets`, `verification_cases`, `case_evidence` and `documents`.
- Assert no-scope invisibility, own visibility, cross-tenant UPDATE/DELETE denial, RLS violation on cross-tenant INSERT, and transaction-local scope reset. On exit, clean up synthetic fixtures using the operator login; process interruption may require discarding the disposable database.
- `tools/release-validation-v51.cjs` enforces restricted runtime setup *before* supervised database/full runs.
- `tools/provision-ci-runtime-role-v57.mjs` no longer exposes raw credentials on non-GitHub terminals and rejects unsafe local environment-output files.
- CI runs `verify:v58` prior to `npm ci`, and the v0.58 live integration step immediately after the v0.57 runtime-role assertion.
- No database migrations changed or added. All application domain modules preserved; DDD/Clean Architecture/SOLID/TDD standards retained.

## Engineering evidence

- `TEST_EVIDENCE_V58.md` and `test-evidence/v58/` include offline tests and blocked release gates.
- Full API/React build not executed successfully in this container (no authentic npm lockfile or installed packages, DNS for npm registry unavailable).
- No Postgres, PostGIS, ClamAV or live restricted-role database connection available here. The v0.58 live security contract is **NOT RUN**.

## Next independent checks

1. Generate, review and commit an authentic `package-lock.json`, then perform clean `npm ci`, vulnerability audit and full API/web build on a trusted connected Kali machine.
2. Apply all 25 SQL migrations to a fresh disposable PostGIS cluster, provision the restricted runtime role, and run v0.57 and v0.58 live tests; keep the logs.
3. Run remaining PostgreSQL, HTTP and browser integration suites, real malware detection, whole Git history scanning, restore drill and deployment security verification.
4. Further review organization-private tables not covered by RLS, least-privilege production grants and independent legal/technical security assessments.

Never upgrade the report from NO-GO based solely on source-only tests or an inferred progress percentage.
