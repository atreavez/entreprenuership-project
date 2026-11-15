# AssetTrust v0.84 — Engineering Handover

## Scope and implementation

This is the complete source continuation of AssetTrust v0.83: NestJS API, React/Vite web interface, global platform and tenant administration, asset/case/document/payment contexts, test harnesses and 27 migrations are retained. It is not a compiled distribution or a production approval.

The v0.84 change targets three concrete MFA authorization races:

1. **MFA disable versus password change:** Before v0.84, `assertPassword` queried the password hash outside the transaction, allowing a concurrent password mutation to commit before the disable transaction obtained its account lock. The new implementation checks the current role and active/suspension status under `users FOR SHARE`, then reads/verifies the password while the lock is still held. Password-changing transactions lock that same user row `FOR UPDATE`, so their writes cannot commit between password verification and the MFA removal. Administrator MFA stays mandatory.
2. **MFA step-up versus revocation:** Before v0.84, step-up read the MFA credential and updated the session by ID/user but did not check current account suspension, organization, session expiry, absolute expiry or revocation inside the transaction. The updated method locks the active user before the MFA credential and only updates an eligible session, rejecting an affected-row count of zero. TOTP last-used step moves **after** the successful session proof write; audit and both mutations commit atomically.
3. **MFA confirmation versus session revocation:** Before v0.84, MFA confirmation updated `mfa_verified_at` without checking whether the row existed or was revoked. It could report success after the enrollment session was no longer active. v0.84 uses a scoped `UPDATE ... RETURNING id` and rejects zero rows, rolling back all changes including recovery-code creation.

The application maintains transaction-bound SQL parameterization and restricts account/session operations to their provided user/organization IDs. These code-level mitigations still require live PostgreSQL isolation and concurrency verification before release.

## Changed paths

- `apps/api/src/auth.ts`
- `tools/tests-v84/mfa-atomic-lifecycle-v84.test.cjs` (new)
- `tools/tests-v18/mfa-recovery-runtime.test.cjs`, `tools/tests-v20/mfa-downgrade-review.test.cjs`, `tools/tests-v83/credential-lifecycle-v83.test.cjs` (updated synthetic SQL fixtures)
- `package.json`, `apps/api/package.json`, `apps/web/package.json`, `.github/workflows/ci.yml`
- `CHANGELOG_V84.md`, `V84_HANDOVER.md`, `V84_KALI_VALIDATION.md`, `TEST_EVIDENCE_V84.md`, `ASSETTRUST_V84_SECURITY_REPORT.md`, `README.md`, `test-evidence/v84/`

## Evidence and limits

- New tests: **28/28 passed**.
- Historical regression matrix: **44/44 suites v0.41–v0.84**, **872** passing counted cases.
- Targeted legacy MFA tests v18, v20, v27, v82, v83 passed after meaningful test-fixture updates.
- Architecture, syntax transpilation (109 TS/TSX), CI checks (82 version suites, 33 PostgreSQL contracts), source-import manifest and current-source secret scanner: passed.
- All 27 SQL files **byte-for-byte identical** to the v0.83 ZIP.
- `lockfile:check:v55` failed as expected: authentic lockfile missing. `npm run build` failed on missing NestJS/Node dependencies because `node_modules` are not present. No real PostgreSQL, PostGIS, ClamAV or browser application was run in this environment. Original Git history is not included.

## Mandatory next acceptance

On connected Kali, use the **reviewed genuine lockfile**, run `npm ci`, dependency audit and both API+web compilations, then use the disposable PostGIS and restricted RLS runtime role. Execute concurrent password changes/resets against MFA disable/step-up/confirm; revoke the current session mid-operation; suspend and demote roles; verify all row-level tenancy isolation; conduct MFA recovery/OTP replay, audit rollback and staged credential rotation tests through actual authenticated HTTP and browser sessions.

Do not reuse customer secrets, data, existing development/production databases or production payment endpoints. A timeout, rollback ambiguity, bypassed verification or unverified mutation is **NOT PASS**.

**Release disposition: NO-GO**, pending proof of the full mandatory security, integration, deployment and independent-review gates.
