# AssetTrust v0.59 engineering handover

**Release state:** Development checkpoint. Production NO-GO.

## Key code changes

- `tools/e2e-pg-runtime-tenant-crud-v59.mjs`: new guarded live two-tenant/dual-connection proof of both permitted and prohibited CRUD. The test intentionally manipulates synthetic data on a disposable database and rolls back authorized temporary rows before asserting their absence.
- `tools/tests-v59/tenant-crud-v59.test.cjs`: 15 dependency-free security, execution-order and guard tests.
- `tools/release-validation-v51.cjs`: early v0.59 mutation authorization and explicit DB-security-test order (v57 → v58 → v59).
- `.github/workflows/ci.yml`: pre-install v0.59 checks and post-migration live CRUD test (after v58).
- `package.json`, `apps/api/package.json`, `apps/web/package.json`: coherent 0.59.0 version and scripts.
- Historical offline fixtures updated only where they referenced the latest milestone or needed the new explicit guard.
- **No SQL migration added/modified.** Existing v0.03–v0.58 source and domain behaviors preserved.

## Independently verified here

- 15/15 v0.59 offline tests, 57/57 complete version-suite regressions with individual logs, source/architecture/CI/syntax checks and identical 25 migrations.
- Release preflight 3/11 and a full build failure due to dependencies absent. No live PostgreSQL, production authentication, antivirus or deployment testing completed.

## Required next work

1. On Kali: genuine npm lockfile, `npm ci`, clean API/web build, dependency audit, browser asset scan.
2. Fresh PostGIS database: role provisioning, migrations, v0.57 role proof, v0.58 seed isolation, v0.59 authorized/forbidden CRUD, multi-server HTTP tests.
3. Resolve actual integration errors, strengthen remaining organization-private RLS and transaction pathways, verify least-privilege production grants.
4. Full security/operations gate, independent penetration/legal review, verified backup restoration. Keep NO-GO until completed.

The platform's verification outputs are **not government title certification** without official legal authority and verified registry integration.
