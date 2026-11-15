# AssetTrust v0.27 — Secure Co-Administrator Onboarding

**Compiled by: Aturinzire Hargreave**

- Added dedicated one-time privileged co-administrator invitations with a one-hour expiry, SHA-256 token hashes, invitee tenant binding, acceptance and revocation audit events, and transactional database authorization.
- Added five-minute recent-MFA requirement to invite or revoke co-administrator access. The issuing administrator's current role, live session, and MFA are checked with row locks; the issuer's role and MFA are rechecked at acceptance.
- Added `008_coadmin_invitation.sql` with mandatory MFA for invited administrators, invitation revocation/acceptance metadata, and append-only checksum manifest.
- Prevented ordinary team-invitation acceptance from redeeming privileged invitations.
- Added fail-closed MFA-enrollment gate on protected API endpoints. New co-admins must confirm authenticator MFA before accessing records; MFA self-disable is blocked for co-admin accounts.
- Added dedicated People & Teams invite/revoke UI and co-admin acceptance/MFA enrollment interface; preserved prior screens.
- Added 19 new offline tests, disposable PostgreSQL smoke script and CI steps, adjusted historical tests for the new migration and module dependencies.
- Release blocked pending authentic npm lockfile, full NestJS/React build and live Postgres/browser integration checks.
