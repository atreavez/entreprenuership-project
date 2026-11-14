# AssetTrust v0.57 - Non-bypass CI runtime database role

Date: 11 November 2026. Development checkpoint. **Release NO-GO**.

## Confirmed issue addressed

The GitHub Actions PostgreSQL service uses a database operator login with superuser privileges for migrations and fixture creation. Earlier row-level security contracts deliberately switched to temporary restricted roles, but the real API smoke processes still inherited that superuser URL. As a result, those API smoke tests did not reliably exercise the database policies that a production-style non-bypass application role must obey.

## Source changes

- `tools/runtime-role-policy-v57.cjs`: validates distinct operator and runtime PostgreSQL URLs on the same approved disposable loopback DB; rejects superuser/operator login reuse for CI API startup; verifies seven RLS table policies and denies an unreviewed runtime role.
- `tools/provision-ci-runtime-role-v57.mjs`: creates a disposable, random-password `assettrust_v57_ci_runtime` login with `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`. Grants broad application DML on **CI only**; this does not establish production least-privilege grants. Appends the masked connection URL to the ephemeral GitHub Actions environment file; refuses to run outside explicitly authorized local CI targets.
- `tools/test-ci-runtime-role-v57.mjs`: read-only **live** contract, checking actual runtime role flags, nonownership, all seven `FORCE ROW LEVEL SECURITY` flags, and denial of unscoped reads. Requires installed `pg` and running disposable PostgreSQL.
- `apps/api/src/database.ts`: applies the existing production DB-role and RLS startup rejection to CI HTTP applications when `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES`.
- `tools/e2e-two-api-v42.mjs`, `tools/ci-live-integration.mjs`: API child processes receive separate restricted credentials; fixture/test orchestration retains the disposable database operator URL. Runtime URL is validated before any spawn in CI. Sensitive runtime URLs are redacted from bounded log excerpts.
- `.github/workflows/ci.yml`: provisions and checks restricted runtime after schema migrations and before HTTP integration tests; enforces the separation in CI.
- Added 20 dependency-free regression tests. All workspace manifests now report v0.57.0. Existing 25 SQL migrations are unchanged.

## Limitations

No npm registry DNS access here (EAI_AGAIN), no authentic lockfile, no installed NestJS/pg dependencies and no disposable PostgreSQL service. Consequently, **the CI runtime role has not been provisioned or proven live here**. No completed full build, browser E2E, Git-history scan, ClamAV service verification or penetration test. This checkpoint cannot authorize deployment.
