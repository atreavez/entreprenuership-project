# AssetTrust v0.83 — Credential Lifecycle & MFA Concurrency

**Date:** 12 November 2026  
**Scope:** Source-level security fix; real dependency-backed build and PostgreSQL acceptance remain unverified.

## Implemented

1. **Old-password login race closed.** `AuthenticationService.login` now rechecks the password hash and active user under a PostgreSQL `FOR SHARE` row lock, and keeps the lock while creating either a provisional/ordinary session or an MFA login challenge. This serializes login issuance against password changes and password resets, which use `FOR UPDATE` on the same user row.
2. **Fresh MFA decision.** Login reads the enabled authenticator state *after* acquiring its account lock. MFA enrollment/confirmation takes a conflicting `FOR NO KEY UPDATE` user lock, preventing concurrent enrollment from silently turning a password-only login into an authorized session.
3. **Password-change invalidation.** Inside the password-change transaction, all pending MFA login challenges are consumed, all unused password-reset requests are revoked, and other sessions are revoked. Failure of any step rolls back the transaction. Existing password reuse prevention remains intact.
4. **MFA challenge completion locked.** Challenge completion first identifies the account, then locks the active user row before consuming the challenge or issuing a session. Issued session and MFA verification are performed while the row lock remains held; a challenge cannot be redeemed after a concurrent password reset/change commits.
5. **MFA enrollment confirmation hardening.** Enrollment verifies the *current* account password inside a user-row-locked transaction. Confirmation requires an active account and obtains the user lock before changing authenticator credentials.
6. **Regression suite.** Added `tools/tests-v83/credential-lifecycle-v83.test.cjs` (29 tests), wired into `package.json` and GitHub Actions. Updated two older mock fixtures to reflect transaction-scoped issuance while preserving security assertions.
7. **Version consistency.** Updated root/API/web manifests to `0.83.0`. No database migration changes.

## Verification and limits

- `npm run verify:v83`: **29/29 PASS**.
- Regression suites v0.41–v0.83: **43/43 PASS**, **844** counted tests, no failures.
- Earlier targeted suites v05, v18, v19, v20, v27, v29, v30, v37, v44, v45: **PASS**.
- Red baseline: running the v0.83 suite against v0.82 source produced **24 failures out of 29** (includes expected older API/test-layout incompatibilities), and v0.83 passed all 29.
- Syntax, architecture, source import checks and CI policy: **PASS**.
- All **27 SQL migration files are byte-for-byte identical** to v0.82.
- Limited current-snapshot secret scan: **PASS** (3,683 scanned files in the final documentation-stage scan; not a full Git-history scan).
- Full TypeScript build: **BLOCKED** (authentic `package-lock.json` and installed NestJS, Node type and other dependencies absent; npm registry DNS returned `EAI_AGAIN`).
- Live PostgreSQL race, MFA HTTP, browser and full production security gates: **NOT RUN**.

**Release status: NO-GO.**
