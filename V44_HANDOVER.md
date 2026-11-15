# AssetTrust v0.44 - Handover

**Milestone:** Secure password recovery with PostgreSQL-shared request throttles and server-only email relay adapter.

**Release verdict:** NO-GO / development checkpoint.

## New endpoints

- `POST /api/v1/auth/password/reset/request` - `{ "email": "..." }`; returns 202 generic response for existing, missing, or rate-limited addresses. Returns 503 for all if relay is unconfigured. Requires exact allowed browser Origin.
- `POST /api/v1/auth/password/reset/confirm` - `{ "token": "...", "newPassword": "..." }`; a single-use time-limited link is required. Requires exact allowed browser Origin; no token accepted via URL query.

## Database change

`019_password_reset.sql` adds `auth_password_reset_requests` and `auth_password_reset_windows`. It cannot be safely skipped or baselined from a newer database. It must be installed by the normal checksummed migration runner after a verified backup.

## Key files

- `apps/api/src/contexts/identity/domain/password-reset-policy.ts`
- `apps/api/src/contexts/identity/infrastructure/password-reset.service.ts`
- `apps/api/src/contexts/identity/infrastructure/password-reset-delivery.ts`
- `apps/api/src/contexts/identity/infrastructure/password-reset.module.ts`
- `apps/web/src/PasswordRecoveryPage.tsx`
- `tools/tests-v44/*.test.cjs`
- `tools/e2e-pg-password-reset-v44.mjs`

## Unverified

No provider delivery, live DB transaction, full npm dependency install/build, independent browser test, distributed two-API reset race, or full Git history scan in this environment. The recipient-sharing and report-signing modules from v0.39-v0.43 are preserved but not retested live. Follow `V44_KALI_VALIDATION.md` and **do not approve release while blockers remain**.
