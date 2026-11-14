# AssetTrust v0.27 — Secure Co-Administrator Onboarding

**Compiled by Aturinzire Hargreave.** Development checkpoint, **not a production certification**.

## Purpose and independence boundary

v0.26 made the FINAL_REVIEW evidence workflow reachable by distinct current organization administrators. The pre-existing invitation endpoint deliberately could not invite `ORG_ADMIN`, leaving that workflow difficult to use. v0.27 adds a **separate privileged onboarding path** instead of broadening normal invitations.

Two distinct administrators can contribute and independently review final decision evidence. Neither this capability nor completion of a verification case proves legal title, changes an official registry, or grants government authority.

## Privileged invitation lifecycle

1. Existing current `ORG_ADMIN` enrolls authenticator MFA if needed, then uses `POST /api/v1/auth/mfa/step-up` with a fresh authenticator code.
2. `POST /api/v1/team/co-admin/invitations` receives `{ "email": "colleague@example.ug" }` with a bearer access token. **Inside the same database transaction that inserts the invitation**, the API checks the current user role, tenant membership, active unrevoked session, absolute/rolling session expiry, enabled MFA, and `mfa_verified_at` within five minutes under row locks.
3. The server generates 32 cryptographically random bytes, returns a base64url invitation token **once**, and persists only its SHA-256 hash. The invitation expires in one hour. A transaction-held tenant/email advisory lock blocks duplicate simultaneous pending invitations.
4. The recipient chooses **Privileged co-administrator** on the invite-acceptance screen and submits the token, full name, and a policy-compliant password via `POST /api/v1/team/co-admin/accept`. The token row is locked. The API rejects expired, revoked, accepted, or unrecognized invitations and rechecks that the inviting administrator still holds active admin/MFA authority. A new user is added in the same organization with `role='ORG_ADMIN'` and `admin_mfa_required=true`. An acceptance audit event is written within the transaction.
5. **Before MFA enrollment:** `AuthGuard` refuses protected workspace endpoints, including cases, documents, assets, professional decisions, and team management. Only the narrow authenticated enrollment/account endpoints are available. New administrators must enroll and confirm authenticator MFA and save their one-time recovery codes to proceed.
6. Co-administrator MFA is a persistent requirement. The ordinary MFA-disable endpoint rejects such accounts. Revoking a pending invitation also requires a current admin and recent MFA, and writes an audit event.

The ordinary `POST /team/accept` query explicitly excludes `ORG_ADMIN` invitation rows to prevent a privileged-token bypass.

## API endpoints (global prefix `/api/v1`)

| Endpoint | Authorization | Operation |
|---|---|---|
| `POST /team/co-admin/invitations` | Current ORG_ADMIN + enabled MFA + fresh step-up | Create one-hour invitation |
| `GET /team/co-admin/invitations` | Current ORG_ADMIN | List invitation metadata; **never tokens** |
| `POST /team/co-admin/invitations/:id/revoke` | Current ORG_ADMIN + fresh MFA | Revoke a pending invitation |
| `POST /team/co-admin/accept` | Public, throttled, single-use token | Create MFA-required co-admin account |
| `POST /auth/mfa/enroll` | Authenticated onboarding account + password | Begin authenticator enrollment |
| `POST /auth/mfa/confirm` | Authenticated onboarding account + code | Enable MFA and issue recovery codes |
| `POST /auth/mfa/step-up` | Existing fully activated administrator | Refresh step-up before issuing invite |

Invitation responses include the raw token exactly once; the `GET` listing does not. Avoid posting tokens in public messages or email threads. Recommended future work: replace manual token delivery with an authenticated, revocable, audited delivery integration.

## Architecture

- **Domain:** `contexts/identity/domain/coadmin-policy.ts` (lifetimes, token-state policy, enrollment-route allowlist).
- **Infrastructure:** `contexts/identity/infrastructure/current-admin-step-up.ts` (live PostgreSQL authorization with row locks).
- **Application orchestration:** `TeamService` and `AuthenticationService` (transactional invitation, acceptance, MFA setup, audit).
- **Persistence:** immutable migration `008_coadmin_invitation.sql` adds required-MFA flag and privileged invitation/audit references; earlier migration hashes are unchanged.
- **UI:** `People & Teams` has a separate co-admin invitation panel; accepting a co-admin invitation leads to mandatory MFA enrollment. Previews are source-derived static renders, not live API screenshots.

## Remaining engineering and governance requirements

The implementation is **offline tested**, not yet validated in a full live app. A working database migration, real login/MFA flow, actual authorized invitation and acceptance, independent final review, source-build typecheck, browser E2E, and operational key management must pass before production. No external government cadastral APIs, payment providers, or blockchain notarization are integrated. The platform cannot verify that two separate accounts represent legally independent persons without a separate identity-verification process.
