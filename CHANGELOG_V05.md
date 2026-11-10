# Version 0.5.0 — Identity & Access Hardening

**Compiled by Aturinzire Hargreave | 6 November 2026**

## Added

- Framework-independent identity domain (credential policy, SHA-256 refresh token digests, encrypted TOTP seeds, RFC6238 time-step verification, replay protection).
- Session application use cases with repository and access-token signing ports.
- PostgreSQL `auth_sessions`, `auth_mfa_credentials`, `auth_login_challenges`, and `auth_recovery_codes` migration.
- Short-lived (15 min) JWTs, server-side session validity/revocation, one-time rotating refresh cookies, replay detection, 7-day rolling/30-day maximum session lifetime.
- Login MFA challenge, authenticator enrollment and confirmation, backup codes, MFA disable, password change, per-device and all-device sign-out.
- Browser in-memory access credential, automatic one-at-a-time session refresh, same-origin HttpOnly refresh cookie.
- Responsive **Account Security** screen and authenticated-device listing.
- 21 offline identity/session/architecture tests and a localhost HTTP/PostgreSQL identity integration script.
- V0.5 architectural/security requirements, updated CI checks, UI previews.

## Changed

- Registration and team invitation password creation follow shared identity policy.
- AuthGuard now validates JWT session identity against revocable database sessions (previous eight-hour stateless JWTs are invalid after v0.5 migration).
- Existing 20 views remain, plus the new 21st Account Security screen.

## Not implemented

- Production-grade email verification/password resets, compulsory privilege-based MFA, distributed brute-force protection, threat-intelligence alerts, key management/rotation, production deployment testing, government registry connections, live payments, external blockchain proofs.
