# AssetTrust v0.84 — Atomic MFA Downgrade, Step-Up and Session Verification

**Checkpoint date:** 12 November 2026. **Status:** source-development milestone; production **NO-GO**.

## Core application changes

- `apps/api/src/auth.ts`: MFA removal now locks the live, unsuspended account in the database **before** verifying the account's current password, eliminating the prior read-before-transaction gap. A password update/reset holding the corresponding PostgreSQL user-row write lock cannot commit in between a successful password check and MFA removal. Mandatory organization administrator MFA remains non-disableable.
- MFA removal verifies an unrevoked, unexpired current session belonging to the same organization **inside the MFA mutation transaction**, locks that session and only then deletes the credential and recovery codes. It clears MFA authorization proof on all sessions and revokes the other sessions in the same transaction.
- MFA step-up locks the current active account and MFA credential, validates the actual current session's user, organization, revocation and both expiry bounds, then writes MFA proof **before** advancing the TOTP replay counter. Failure rolls back all changes; audit writing is also transaction-scoped.
- MFA enrollment confirmation now requires an updated row from the **current, unrevoked, unexpired session** within the same tenant; a lost/revoked session causes the entire confirmation (credential activation, recovery code creation, other-session revocations and audit) to roll back.
- Preserved existing domain boundaries, tenant isolation, parameterized SQL, administrator MFA requirements, password/reset semantics and all 27 SQL migrations.

## Automated tests and compatibility

- New `tools/tests-v84/mfa-atomic-lifecycle-v84.test.cjs`: 28 passed tests exercising the **actual transpiled AuthenticationService methods** with a fault-injectable transaction adapter. Tests are offline simulations, **not** live PostgreSQL proof.
- Historical `tools/tests-v18`, `tools/tests-v20` and `tools/tests-v83` test adapters updated to represent the strengthened active-session checks; their original substantive security assertions are retained.
- `.github/workflows/ci.yml` requires `npm run verify:v84`, and root/API/web package versions align to `0.84.0`.
- Full v0.41–v0.84 regression matrix: 44/44 suites, 872 counted passing tests. Architecture, syntax, import contracts and CI policy passed.

## Known release blockers

No authentic `package-lock.json`, no installed application dependencies, no trusted network registry access and no original `.git` history in the distributed checkpoint. Consequently, **full compilation, npm audit, Git-history secret scanning, real PostgreSQL concurrency, authenticated API/browser acceptance, deployment drills and independent security review have NOT passed**. Do not deploy with customer data. See `V84_KALI_VALIDATION.md`, `TEST_EVIDENCE_V84.md` and `ASSETTRUST_V84_SECURITY_REPORT.md`.
