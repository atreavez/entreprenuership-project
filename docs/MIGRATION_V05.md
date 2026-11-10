# Database and frontend upgrade — v0.4 to v0.5

**Important:** Test against a **backup of development data only**, never directly against a production database. Existing v0.4 access JWTs will be refused after v0.5, because they do not have a server-side session ID.

1. Back up the v0.4 PostgreSQL development database. The updated migration runner executes `001_init.sql` through `004_identity_security.sql`. Each migration uses an explicit transaction; verify repeated migrations are safe on a disposable database.
2. Set independent `JWT_SECRET` and `MFA_ENCRYPTION_KEY` values using separate `openssl rand -hex 32` commands.
3. Run `npm install`, `npm run db:migrate --workspace apps/api`, `npm run build`, and the existing offline tests.
4. Serve React and the API behind a common origin. Development setup uses Vite proxy `/api` and `WEB_ORIGIN=http://localhost:5173`.
5. Access tokens now live in memory; browser refresh is provided by the `assettrust_refresh` HttpOnly cookie. Previously stored `assettrust_token` values in sessionStorage are no longer used and should be cleared manually from old developer environments if desired. An old login is deliberately not carried into the new session model.
6. Validate registration, refresh rotation, token-replay session invalidation, TOTP, backup-code consumption and logout with the disposable localhost E2E script.
7. Check backup/restore of `auth_sessions`, `auth_mfa_credentials` and the MFA encryption key. Losing the MFA encryption key can prevent affected account holders from authenticating.
8. Full security review, HTTPS reverse proxy, accessibility tests and penetration testing are mandatory before allowing real documents or public access.

**Do not deploy** if no approved account-recovery channel exists for MFA lockout cases or if production secrets are stored in source control.
