# AssetTrust v0.5 — Identity, Sessions and MFA Architecture

**Compiled by Aturinzire Hargreave | 6 November 2026**

## Scope and bounded context

AssetTrust must separate **identity** (who an account represents), **authentication** (proof of account control), **organizational authorization** (which organization and resources may be accessed), and **professional accreditation** (who is authorized to make legally sensitive review decisions). A password or MFA code proves account control only; it does **not** prove professional qualifications or land ownership.

v0.5 implements a framework-independent Identity **domain** (`contexts/identity/domain/identity-policy.ts`) and Sessions **application use case** (`contexts/identity/application/session-usecases.ts`), with a PostgreSQL adapter (`contexts/identity/infrastructure/pg-session.repository.ts`) and NestJS delivery layer (`auth.ts`). This is an incremental refactor, not an assertion that all legacy services are Clean Architecture yet.

```text
React (Account Security, login, MFA challenge)
     |
     | access token in memory, rotating refresh HttpOnly cookie
     v
NestJS AuthController / AuthGuard    [presentation / infrastructure]
     |
     v
AuthenticationService               [current orchestration; future extraction]
     |
     +--> SessionUseCases            [application; depends on ports]
     |       |               |
     |       v               v
     |   SessionRepository  AccessTokenIssuer   [ports]
     |       ^               ^
     |       |               |
     |   PgSessionRepo       JwtService Adapter [infrastructure]
     |
     +--> IdentityPolicy: TOTP, tokens, password rules, AES-GCM [pure domain]
     |
     +--> PostgreSQL auth_mfa_credentials, auth_recovery_codes,
          auth_login_challenges, users / audit_events
```

## Security invariants

1. Passwords are hashed by Argon2id and never returned. New user and invited-user passwords are 12–128 characters with letters and numbers; server-side policy is authoritative.
2. Password sign-in for an MFA-enabled account returns a short-lived **MFA challenge, not a session**. The one-time challenge expires after five minutes and allows at most five attempts.
3. Authenticator codes use RFC 6238 SHA1-based TOTP, 30-second timestep, ±1 timestep time-drift allowance, and atomic monotonic `last_used_step` replay protection.
4. MFA seeds are encrypted using AES-256-GCM with an independently managed 32-byte environment key. Seed encryption key must be preserved and backed up securely; JWT secret is separate.
5. After enabling MFA, **other** sessions are revoked. Enabling MFA requires the active session, current password and a valid authenticator code.
6. Ten recovery codes are random, displayed once, stored by SHA-256 digest only, and consumed in a PostgreSQL transaction. Recovery codes can fulfill a login challenge once.
7. The password-change endpoint requires the current password and a new non-identical password. It revokes other sessions.
8. Refresh credential is a 256-bit random bearer secret stored **only as SHA-256 digest** in PostgreSQL. Rotation occurs under `SELECT ... FOR UPDATE`; reuse revokes the session (committed transaction), including its signed JWTs.
9. JWT access tokens expire after **15 minutes**; refresh sessions have a seven-day rolling life capped by a thirty-day absolute expiry. Every protected API call also checks an active server-side session and the current user/org binding.
10. Refresh credentials are returned in **HttpOnly, SameSite=Strict** cookies scoped to `/api/v1/auth`; cookies are Secure when `NODE_ENV=production`. JWT access tokens are **in-memory only** in the React app, not browser local or session storage.
11. Cookie-backed state-change routes validate `Origin` when present, reject `Sec-Fetch-Site: cross-site`, and rely on same-site deployment and strict cookies. Extend CSRF controls before permitting cross-site application hosting.
12. Sessions are bound to user and organization. A user cannot revoke another user's session through the session repository. A session can be individually revoked or all sessions revoked.
13. Login failures use a generic `Incorrect credentials` response. Controller throttling is applied. For distributed production instances a shared rate limiter is REQUIRED.
14. Secrets, token content and MFA recovery codes MUST NOT be recorded in audit metadata, analytics or logs. Security change events store action, actor and timestamp.
15. Professional approval and high-value decisions remain separate from general account login; authorized reviewers must still be independently accredited.

## HTTP routes and permission model

All routes are under `/api/v1/auth`.

| Endpoint | Method | Credential | Behavior |
| --- | --- | --- | --- |
| `/register` | POST | Public, throttled | Create organization/admin then issue session and refresh cookie |
| `/login` | POST | Public, throttled | Sign in, or return MFA challenge |
| `/mfa/complete` | POST | Pending MFA challenge | Consume TOTP or one-time backup code then issue session |
| `/refresh` | POST | HttpOnly refresh cookie | Rotates credential, returns access token and user |
| `/me` | GET | Active JWT + session | Return current principal |
| `/logout` | POST | Active JWT + session | Revoke current session, clear refresh cookie |
| `/logout-all` | POST | Active JWT + session | Revoke all sessions and clear refresh cookie |
| `/sessions` | GET | Active JWT + session | List only the principal's sessions |
| `/sessions/revoke` | POST | Active JWT + session | Revoke own target session by UUID |
| `/password/change` | POST | Active JWT + current password | Change password; revoke other sessions |
| `/mfa/status` | GET | Active JWT | Enabled status, unused recovery-code count |
| `/mfa/enroll` | POST | Active JWT + current password | Create pending encrypted seed, return setup key |
| `/mfa/confirm` | POST | Active JWT + TOTP code | Enable MFA, return ten backup codes ONCE |
| `/mfa/disable` | POST | Active JWT + password + TOTP or backup | Disable MFA; revoke other sessions |

### Example request shape (fictional data)

```json
POST /api/v1/auth/login
{"email":"test.user@example.invalid","password":"SomeSecurePassphrase42"}
```

For MFA-enabled accounts, response is `{ "mfaRequired": true, "challengeToken": "...", "expiresIn": 300 }`. Do not send or store the refresh token in JavaScript. The refresh endpoint gets it from a same-origin HttpOnly cookie.

## DDD + SOLID evidence

- **S — SRP:** `identity-policy.ts` validates and cryptographically processes credentials; `session-usecases.ts` manages session lifecycles; `pg-session.repository.ts` owns SQL; `SecurityPage.tsx` owns user interaction.
- **O — OCP:** `SessionRepository` and `AccessTokenIssuer` are replaceable ports. New persistence or token issuers need not change session use cases.
- **L — LSP:** in-memory test double satisfies the same `SessionRepository` operations as the PostgreSQL implementation; use cases are independently testable.
- **I — ISP:** session port contains only the methods needed to create, rotate, authorize and revoke sessions, not generic multi-domain data access.
- **D — DIP:** application layer imports interfaces rather than NestJS, `pg`, Express, React or other infrastructure details.
- **Security by Design:** revoke-on-reuse, account binding, MFA replay defense, current-password step-up, restrictive cookies, audit changes, and explicit opt-in MFA are enforced by backend, not frontend badges.

## TDD evidence

1. **RED:** `tools/tests-v05/identity-domain.test.cjs` was authored first and failed when the domain file did not yet exist; captured in `docs/TEST_EVIDENCE_V05.md`.
2. **GREEN:** domain crypto/policy implemented and 8 domain tests passed.
3. **REFACTOR:** session lifecycle was moved into `SessionUseCases` with repository and JWT-signing ports; six additional tests passed against a fake repository. Seven security-source contract checks subsequently passed (21 tests total).
4. New local HTTP/database integration test `tools/e2e-identity-v05.mjs` is included for later execution. It has **not** been run in this authoring environment.

## Remaining production blockers

- No live PostgreSQL integration results in the authoring environment; SQL migrations and NestJS DI require CI/local execution.
- No real email verification, password reset email, account recovery policy, suspicious-login notifications, or anti-enumeration review beyond generic failed-login response.
- Production MFA key rotation, safe re-encryption and disaster recovery are unimplemented.
- Distributed Redis-backed rate limiting, account-level lockout, breached-password screening and anti-bot controls remain future work.
- OTP/TOTP should be independently reviewed before handling sensitive owner documents. MFA is optional in v0.5; enforce stronger controls for privileged workflows in the next milestone.
- No verified accreditation provider, government-registry authorization, payment reconciliation, or blockchain anchoring.
- Session administration is implemented but security monitoring/SIEM integration, device fingerprinting and security alert outbox are not.
- There is no production-approved HTTPS reverse proxy, CSP review, penetration test or independent legal review.

**Release gate: DEVELOPMENT ONLY. Do not upload actual title deeds, identity documents or financial records.**
