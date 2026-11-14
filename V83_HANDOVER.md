# AssetTrust v0.83 — Engineering Handover

## What this checkpoint is

A complete development-source continuation of v0.82, with a targeted credential-lifecycle and concurrent MFA fix. It retains the platform admin and organization admin interfaces, asset/case/document/billing workflows, existing database migrations, security scripts and tests. It is **not** a compiled distribution, an audited dependency lockfile, a verified container deployment or a production authorization.

## Root-cause analysis

In v0.82, an initial password match could be calculated while a separate request changed the password. Before that change, or even after it committed, the login could then create an MFA challenge or a session without a second locked credential check. Additionally, password changes revoked other sessions but left pre-existing MFA challenges and reset requests outstanding. An MFA challenge completion also inserted its session *after* its challenge-consumption transaction had ended.

These are separate time-of-check/time-of-use risks. Each can defeat an operator's expectation that updating a password immediately invalidates credentials proven with the old password.

## Security design now in source

- **Lock order:** password-changing actions lock the user; login uses `FOR SHARE`; MFA enrollment/confirmation uses `FOR NO KEY UPDATE`; challenge completion locks the user before locking the challenge and authenticator credential. PostgreSQL operations remain parameterized.
- **Commit behavior:** a password change must update the hash, revoke other sessions, consume pending challenges and revoke unused reset requests as **one transaction**. If any step fails, the mutation does not commit.
- **Account state:** login rechecks the active user and originally verified password digest under lock. The MFA decision is read under that same protected login transaction and enforced after confirmation. Session issuance remains under the account lock.
- **MFA challenge redemption:** an account lock stays held through the challenge's consumption, session issuance and session MFA proof write. Expired, previously used, invalid or suspended-account challenges remain denied.
- **MFA setup:** current password is verified under an active account lock. Confirmation uses the same lock ordering, protecting optional and mandatory MFA activation.
- **Architecture:** pure identity policies remain outside the NestJS adapter. All credential SQL changes stay in the authentication infrastructure boundary. No unreviewed schema migration introduced.

### Files changed materially

- `apps/api/src/auth.ts` — runtime authentication and credential locking.
- `tools/tests-v83/credential-lifecycle-v83.test.cjs` — new fault-injection and concurrency-ordering offline tests.
- `tools/tests-v19/login-enumeration.test.cjs`, `tools/tests-v29/auth-suspension.test.cjs` — updated test DB transaction mocks (same substantive security expectations).
- `.github/workflows/ci.yml`, `package.json` — add v0.83 test gate.
- `apps/api/package.json`, `apps/web/package.json` — version alignment.
- `README.md`, `CHANGELOG_V83.md`, milestone evidence and release report.

## Acceptance evidence

The complete v0.41–v0.83 regression matrix passed (43 suites, 844 cases). New v0.83 suite passed 29/29. Older security suite selections passed. Architecture, syntax, import, CI and limited source-credential checks passed. Full build failed because the archive cannot install npm dependencies here. The authentic lockfile is absent and registry DNS failed; this cannot be honestly upgraded to a successful compilation verdict.

The current environment cannot execute PostGIS, ClamAV or authenticated browser tests; prior live test harnesses exist but have not been executed for this milestone. No original `.git` history exists in the source ZIP, so a full-history secret scan is not possible on this archive alone. A separate review of actual source Git history is required.

## Known residual risks / mandatory work

1. Obtain and review authentic lockfile from the connected trusted repository / generated fresh lockfile for an isolated ZIP; run `npm ci`, `npm audit`, `npm run build` and fix any **genuine** semantic/compiler errors. Do not fabricate or pin an unreviewed lockfile.
2. On disposable local PostGIS under a restricted RLS non-owner runtime role, race concurrent login, MFA setup/confirmation, MFA challenge redemption, password change and password reset. Verify session-challenge and reset-token invalidation, rollback, race termination, and multi-tenant isolation.
3. Execute real E2E authenticated API and browser workflows for founder onboarding, MFA, co-admin invitation, asset verification, documents, payments, settings and production admin panel.
4. Re-run comprehensive security gate: login abuse resistance, reset tokens, cookie/CSRF origin, authorization and RLS, encrypted upload/scan, HTTPS/TLS, DB grants, audit/event integrity, static and dynamic checks, original Git-history secret scan, deploy and rollback drills.
5. Independent review of behavior under database/network failures, compromised session recovery, auth credential rotation, lock contention and high concurrency.

**Decision:** development source checkpoint accepted; production **NO-GO**.
