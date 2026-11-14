# AssetTrust v0.60 - Engineering Handover

**Status:** Offline checkpoint complete; production release **NO-GO**.

## Files most relevant to the change

- `tools/provision-ci-runtime-role-v57.mjs`: creation of the restricted disposable role with newly narrowed internal-table privileges.
- `tools/harden-ci-runtime-grants-v60.mjs`: safe, explicitly authorized repair for an existing disposable role.
- `tools/runtime-privilege-policy-v60.cjs`: dependency-free policy and fail-closed evaluator.
- `tools/test-ci-runtime-privileges-v60.mjs`: live, read-only PostgreSQL effective-privilege audit.
- `tools/tests-v60/runtime-privileges-v60.test.cjs`: 15 tests of the policy, safety gates, CI order and compatibility.
- `tools/release-validation-v51.cjs`: verifies privilege checks are scheduled before seeding cross-tenant fixtures.
- `.github/workflows/ci.yml`: automated check after database role provisioning and before seeded tests.

## Important security boundaries

This checkpoint intentionally leaves data-model migrations unchanged. It restricts **the disposable CI API role**; it does not change your existing production role automatically and is not a blanket database-wide permissions audit. All API runtime tables other than the existing seven RLS tables remain candidates for row-level security and least-privilege review. An SQL injection vulnerability is not neutralized simply by this change; server authorization, parameterized queries and network isolation remain essential.

**Do not** run the v0.60 repair script against production, shared databases, or a database under another name. The guard rejects these by design. For production, separately review privileges, run tested migration/deployment procedures, and use a distinct restricted application account.

## Operator handoff

Follow `V60_KALI_VALIDATION.md` to: create a genuine lockfile on Kali with trusted internet, install dependencies, compile the API and web, connect to an explicitly disposable PostgreSQL database, provision or repair the scoped runtime role, run the real privilege audit, seeded RLS contracts, HTTP/browser tests, ClamAV checks, and Git-history scan.

Retain the raw command logs, role privilege findings, independent approvals and secure handling of access credentials. Any failed security check means stop/no release.
