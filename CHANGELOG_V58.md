# AssetTrust v0.58 - Seeded runtime RLS verification and release guardrails

Date: 11 November 2026. Status: **DEVELOPMENT CHECKPOINT - PRODUCTION NO-GO**.

## Why this change

The v0.57 restricted-role check verified PostgreSQL role flags and RLS policy presence. Its unscoped SELECT also returned zero on an empty database, which is insufficient to prove that protected rows are actually invisible. The supervised `--full`/`--database` runner could also reach its test sequence without confirming an independent restricted runtime URL. Finally, the GitHub-specific `::add-mask::` lines in the CI role provisioner would print a freshly generated password to an ordinary Kali terminal, because the GitHub log masker is not present there.

## Implemented

1. Added `tools/e2e-pg-runtime-tenant-isolation-v58.mjs`. This guarded **live** test creates synthetic records for two organizations in a disposable PostgreSQL database, commits them using the operator account, and then tests the four private core tables **using a different PostgreSQL connection authenticated as the v0.57 restricted runtime role**. It verifies no-scope reads, own-scope reads, cross-tenant UPDATE/DELETE denial, RLS `WITH CHECK` INSERT rejection and tenant-scope reset after transactions.
2. The test always attempts cleanup of committed fixtures. It refuses production, remote or unexpected database names before loading `pg`. An interrupted process may leave synthetic rows in the disposable database; never reuse the database for real records.
3. Updated `tools/release-validation-v51.cjs` to require `CI=true`, `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES`, `ASSETTRUST_V58_SEEDED_RLS_CONFIRM=YES`, and a separate validated runtime URL **before** `--database` or `--full` executes any stage.
4. The GitHub Actions workflow runs `verify:v58` before dependency installation and the new seeded RLS contract after runtime-role provisioning, before HTTP tests. The supervised release plan discovers the new PostgreSQL test automatically.
5. Hardened `tools/provision-ci-runtime-role-v57.mjs`: actual password and URL are masked only when the host truly is GitHub Actions; an ordinary Kali terminal never receives the raw `::add-mask::` lines. The local environment-output file must be private (0600), regular, and not a symlink.
6. New `tools/tests-v58/` dependency-free security tests. Updated the historical v0.51/v0.57 test fixtures to preserve their safety expectations with the current version.
7. All three workspace manifests now use `0.58.0`. The existing 25 SQL migrations are unchanged.

## What this does not prove

The simulated and source-only tests pass **without** accessing PostgreSQL. The actual new two-organization test has **not** been executed here: project dependencies and PostgreSQL are absent. It does not yet test PDF-layout table rows or the other organization-private tables without RLS. It is not a full browser, payment, audit, legal, malware-scanner, or production infrastructure review.

For actual execution, use `V58_KALI_VALIDATION.md` in a trusted isolated Kali environment. Keep the release verdict **NO-GO** until genuine lockfile, build, ClamAV, live PostgreSQL, original Git history, browser and operational evidence all pass.
