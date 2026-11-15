# AssetTrust v0.60 - Restricted Runtime Privileges (11 November 2026)

## Scope

This is a source checkpoint focused on **CI and disposable-test PostgreSQL permissions**, not a production deployment approval. The project follows v0.59 without rewriting any of the 25 historical schema migrations.

## Changes delivered

1. Updated `tools/provision-ci-runtime-role-v57.mjs`: after granting normal application-table privileges, revoke `INSERT`, `UPDATE`, and `DELETE` on `public.assettrust_schema_migrations` and revoke `UPDATE` and `DELETE` on `public.audit_events` from the restricted disposable API role. The application continues to be allowed to read migration status and append audit events.
2. Added `tools/runtime-privilege-policy-v60.cjs`: pure, fail-closed policy checks for migration-ledger and audit privileges, database/schema creation privileges, inherited role memberships and elevated PostgreSQL role flags.
3. Added `tools/test-ci-runtime-privileges-v60.mjs`: read-only real PostgreSQL role audit which validates disposable targets and independent operator/runtime URLs before connecting.
4. Added `tools/harden-ci-runtime-grants-v60.mjs`: explicitly authorized, idempotent grant repair for an already-provisioned role on an approved disposable loopback database. It is not a production migration tool.
5. Updated `.github/workflows/ci.yml` and `tools/release-validation-v51.cjs` so role identity is checked first, database grants are checked second, and seeded RLS/CRUD testing follows. Existing CI rules still require explicit mutation authorization for any `test:pg:*` step, even the read-only privilege audit.
6. Added `verify:v60`, `test:pg:runtime-privileges:v60` and `db:runtime-grants:v60` commands. Updated all three project package versions to `0.60.0`.
7. Updated two historical test assertions to accept later synchronized application versions instead of remaining pinned to `0.59.0`.

## Validated here

- `npm run verify:v60`: 15/15 passed.
- `npm run verify:v03` through `npm run verify:v60`: 58/58 suites exited 0, with individual command logs and recorded exit codes.
- 25/25 SQL migrations matched the v0.59 source byte for byte.
- CI YAML parser/policy, CI coverage, architecture checks, TypeScript syntax scan and Vite source gate passed.
- Current-source secret scan passed; this is not full Git-history analysis.

## Still blocked

There is no authentic `package-lock.json`, the npm registry is unreachable here, and the `npm run build` command fails on missing Node type definitions. There is no available live PostgreSQL or ClamAV service. The new effective-privilege audit has **not** executed on a real database. The API role retains broad data access for other unprotected tables; this milestone is not database-wide least privilege.

**Release decision: NO-GO** for production or real customer records.
