# AssetTrust v0.82 — Mandatory Administrator MFA and Session-Bound Authorization

**Development checkpoint · 12 November 2026 · Release: NO-GO**

## Confirmed security gap

The v0.81 backend applied privileged MFA enrollment only when `users.admin_mfa_required` was true. Registration created an `ORG_ADMIN` without setting that flag. As a result, new founder administrators and some legacy administrators could access administrative and ordinary workspace endpoints without enrolling MFA. Even for flagged administrators, the AuthGuard checked whether an MFA credential was enabled, but not whether **the current bearer-token session** had actually completed an MFA challenge.

## Implementation

- Added framework-independent domain functions `requiresAdminMfa()` and `hasAdminSessionMfaProof()` to `coadmin-policy.ts`. `ORG_ADMIN` now always requires MFA, independently of the legacy database flag; additional explicitly flagged roles retain the previous stricter requirement.
- Founder registration explicitly writes `admin_mfa_required=true` and returns a user profile that triggers the existing MFA enrollment UI. Existing legacy admins remain protected without modifying historical records.
- `AuthenticationService.lookup()` and `login()` derive effective MFA requirements from the current database role and flag.
- `AuthGuard` binds the active MFA credential and `mfa_verified_at` to the *same* active, non-revoked, non-expired auth session by user ID, organization ID and signed JWT session ID. Only the narrow authenticated enrollment/logout routes remain available pending MFA confirmation.
- The MFA-disable flow queries the current user role in the same protected database transaction; no founder or legacy admin can remove mandatory MFA merely because their old flag is false.
- Administrator refreshes are checked after rotation: an old privileged session whose MFA credential was enabled in another session must perform a new password+MFA login. Unenrolled founder sessions may refresh *only as provisional enrollment sessions*. Non-admin refresh is unchanged.
- Updated existing synthetic live-test journeys (v0.03, v0.08, v0.10, v0.69, v0.73) to enroll administrators using valid HMAC-SHA1 TOTP codes before accessing protected endpoints. The helper never logs credentials or recovery codes and has no network access of its own.
- The v0.69 test's early “privileged writes denied for lack of step-up” assertion became inapplicable immediately after MFA confirmation (which creates a recent verification timestamp); replaced with non-admin privileged-write denial. Independent approval and separate step-up negative tests still require live verification.

## Verification and limitations

- v0.82 tests: **45/45 passed**. Before implementation, 22 of the initial 28 new tests failed against v0.81 (TDD RED evidence).
- Offline version suites v0.41–v0.82: **42/42 passed; 815 counted tests**.
- Architecture, syntax, direct-source import, CI policy and pure domain compilation: passed.
- All 27 SQL migrations byte-for-byte unchanged from v0.81; no schema or RLS-predicate claims changed.
- Limited source snapshot secret scan: zero high-confidence issues in 3,596 files; **not** a Git-history audit.
- `npm run build`: **BLOCKED** by absent actual Node/NestJS/Express dependencies (`TS2688` and `TS2307`); genuine lockfile is missing and the authoring environment cannot access the npm registry.
- Real PostGIS, API HTTP, browser, ClamAV, double-admin approval and full dependency-backed compiler checks: **NOT EXECUTED HERE**.

Release remains **NO-GO** until real Kali compilation, live integration tests, independent security gate and deployment acceptance pass. See `V82_KALI_VALIDATION.md`.
