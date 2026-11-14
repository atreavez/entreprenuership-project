# AssetTrust v0.63 - Engineering handover

## Objective and implementation

Close a database-startup safety gap: `relrowsecurity` and `relforcerowsecurity` alone do not detect a newly added permissive OR policy. The v0.63 API also verifies the complete reviewed `pg_policies` inventory, including the recipient-specific inbox rules.

### Source files

- `apps/api/src/contexts/tenant-isolation/domain/rls-policy-contract.ts` - pure policy contract, expected 16-policy inventory, strict predicate normalization and fail-closed check.
- `apps/api/src/database.ts` - live startup query to `pg_policies`, fail-closed on policy mismatch.
- `tools/test-pg-policy-contract-v63.mjs` - read-only live audit using the restricted runtime role, guarded to a named disposable loopback PostgreSQL database.
- `tools/tests-v63/rls-policy-contract-v63.test.cjs` - 31 scenario tests, including actual startup behavior under fake PostgreSQL.
- `.github/workflows/ci.yml` - order corrected so TypeScript-requiring tests run after npm ci, with live policy audit before database fixtures.
- `tools/release-validation-v51.cjs` - supervised plan updated with explicit confirmation.

### Engineering constraints

Preserve DDD / Clean Architecture: policy expectation is framework-independent; PostgreSQL catalog lookup remains in the infrastructure Database adapter. Do not remove migrations, weaken tenant RLS or make policy validation optional in production. The check may reject format changes across PostgreSQL versions; inspect database catalog output and update the approved predicate contract only with review and tests.

### Release blockers

The genuine lockfile and node_modules are absent in this source ZIP. No PostgreSQL daemon is available in the offline build environment. Full application build, seeded two-organization CRUD, audit RLS, role-permission audit, ClamAV, browser flows, Git-history scanning of the user’s original repository and deployment security evidence remain outstanding. Do not deploy to production.

### Recommended next action

Run `V63_KALI_VALIDATION.md` on the trusted connected Kali development computer and preserve **redacted** outputs of the first failing command. Fix actual build errors before adding more source-only validation features. When updating policy contracts, test on the exact PostgreSQL production major version against a restored staging copy.
