# AssetTrust v0.82 — Engineering Handover

**Date:** 12 November 2026  
**Base:** v0.81 full-source checkpoint  
**Status:** Source implementation complete; full compilation and live acceptance **NOT YET VERIFIED**; **PRODUCTION NO-GO**.

## 1. What changed

This milestone resolves two related administrator-authentication issues in the real application, rather than simply adding another release checklist.

**Administrator MFA is unconditional:** any user whose *current database role* is `ORG_ADMIN` must enroll and confirm authenticator MFA before accessing workspace data. Previous founder registrations did not set the `admin_mfa_required` flag. That historical flag is now supplemental; the role itself is authoritative. New registrations write the flag explicitly; legacy administrators are enforced without a data migration.

**MFA proof must belong to this session:** `AuthGuard` retrieves the current session’s `mfa_verified_at` alongside the active MFA credential, requiring an exact active session/user/organization match. A token minted before another session enabled MFA no longer gains workspace authorization simply because the account's credential is active. Provisional founder sessions can access only approved MFA enrollment and session-management routes. Admin attempts to disable MFA are rejected using current transactional role checks.

**Refresh is fail-closed:** administrators with MFA enabled cannot refresh a token for a session lacking its own verification proof. They must perform password-plus-MFA login again. Unenrolled administrators retain a *restricted* provisional refresh, and ordinary non-admin users retain their previous refresh behavior.

**Actual synthetic test journeys updated:** prior integration scripts for basic API, geo, overlaps, admin-control and document revocation now enroll synthetic founders with HMAC-SHA1 TOTP before protected operations. This avoids weakening or bypassing the security guard to make old tests pass. The helper retains secrets only in memory and reports no passwords, TOTP secrets or recovery codes.

Relevant source changes:
- `apps/api/src/auth.ts`
- `apps/api/src/contexts/identity/domain/coadmin-policy.ts`
- `apps/web/src/App.tsx`
- `tools/e2e-mfa-onboarding-v82.mjs`
- Updated the five synthetic HTTP test journeys and their offline fixtures
- `tools/tests-v82/` and CI `verify:v82`, plus package/workspace versions.

DDD domain policy, NestJS adapter boundaries, TDD/RED-GREEN evidence, existing audit, RLS and MFA step-up logic are preserved. The 27 migration SQL files have **no changes**.

## 2. Evidence verified here

| Item | Result |
|---|---|
| New v0.82 security tests | PASS 45/45 |
| Initial RED check against v0.81 | 22 failures out of first 28 tests |
| Historical v0.41–v0.82 version matrix | PASS 42/42 suites, 815 counted cases |
| Architecture, syntax, source graph, CI policy | PASS |
| Independent pure TypeScript domain compilation | PASS |
| Earlier MFA/authentication suites v18, v19, v20, v27, v29 | PASS after adapting narrowly scoped mock fixtures to session proof |
| Existing v69 and v73 synthetic HTTP mock tests | PASS with actual enrollment endpoints modeled |
| SQL migration integrity | All 27 byte-for-byte unchanged |
| Limited current-source secret scan | PASS, 3,596 scanned files, no high-confidence matches before final docs |
| Genuine npm lockfile | ABSENT — do not fabricate |
| Actual dependency-backed TypeScript + Vite build | BLOCKED: missing packages and @types/node; not passed |
| Real database, live HTTP, browser, malware scanner | NOT RUN in this environment |
| Full Git-history scan / independent release signoff | NOT RUN |
| Production approval | **NO-GO** |

Test logs and matrix are under `test-evidence/v82/`. The full build attempt's first dependency errors and release preflight's missing-lockfile outcome are recorded; do not present them as application source/type failures until the real dependencies are installed.

## 3. Behavior and compatibility notes

Existing administrators who have not enrolled MFA will be required to do so after this update; this is an intentional security gate. A previously logged-in administrator whose MFA was enabled in a different session must sign in again, which can invalidate that session's refresh token. Customer-facing roles that do not have a mandatory MFA flag can continue using the product without forced MFA.

The existing registration flow, owner-operated MFA onboarding screen and MFA recovery-code issuance remain available. The legacy v0.69 synthetic test had a negative assertion premised on being unauthenticated with MFA. Because an immediately confirmed MFA enrollment is now a recent verification event, its privileged-write negative assertion was moved to a genuinely non-admin reviewer; independent sensitive-write approval and fresh MFA aging must still be verified through live tests.

## 4. Remaining release blockers

- Obtain an authentic reviewed `package-lock.json` on trusted connected Kali or from the original Git repository, and install it with `npm ci`.
- Run genuine API and frontend builds; record and fix first real compiler/runtime errors.
- Run guarded disposable PostgreSQL role, RLS, migration, MFA-enrollment, session-revocation, authenticated HTTP and document revocation acceptance against a *restricted* application role.
- Verify first-admin onboarding, reauthentication of legacy admin sessions, MFA-disable denial, recovery codes, browser behavior and independent privileged-approval rules.
- Review production TLS, secrets, backup/restore, PostGIS, ClamAV, dependency audit, history secret scan, concurrency and independent adversarial security gate.

Follow `V82_KALI_VALIDATION.md`. Do not merge or deploy this as production-ready merely because offline tests pass.
