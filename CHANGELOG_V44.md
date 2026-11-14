# AssetTrust v0.44 - Secure Password Recovery Checkpoint

Date: 11 November 2026 | Status: OFFLINE-TESTED, RELEASE BLOCKED

## Changes

- Added a dedicated identity-domain password-reset policy: cryptographically random 256-bit opaque links, canonical base64url checks, SHA-256 hashes at rest, 15-minute lifetime, strict password policy.
- Added migration `019_password_reset.sql`: one-active-request-per-account constraint, delivery state and revocation fields, indexed expiry, PostgreSQL shared request-count window keyed by HMAC(email, server-only pepper).
- Added unauthenticated, origin-validated, throttled request and confirm endpoints under `/api/v1/auth/password/reset/`.
- Added HTTPS-only server-side delivery adapter with no redirects, finite timeout, server-only credentials and explicit WEB_ORIGIN matching. No provider is enabled by default.
- Added owner-row locks, transactional one-use token consumption, Argon2id new hashes, session and login-challenge revocation, and tenant-attributed audit records. Existing MFA enrollment remains intact.
- Added browser recovery screens. Tokens arrive in the URL *fragment*, are removed from browser history, and are transmitted only in POST bodies; not in URL queries.
- Added disposable PostgreSQL contract test and CI coverage for v0.44.
- Updated schema fingerprint manifest and legacy forward-version compatibility tests without changing any of the first 18 SQL migrations.

## Test evidence

- v0.44 offline tests: 16/16 passing (domain, service, relay, static security contracts).
- v0.03-v0.44 version commands: 42/42 passing.
- Source scan, architecture and transpile/syntax checks passed separately.
- Red tests were run before v0.44 implementation; initial failures expected because reset modules were missing. `test-evidence/v44/` contains logs.

## Not complete

Live PostgreSQL contract and authenticated HTTP/browser integration were not run. External email transport, full compilation, lockfile, dependency audit, Git history secret scan, installed HTTPS and host firewall/SSH hardening remain unverified. Release status: NO-GO.

## Caveats

The HTTPS relay is a documented adapter contract, not an implemented or validated integration with a real email provider. Do not enable password recovery until the server-only relay is deployed, tested, monitored and authorized. Existing v0.43 cross-project FINAL SECURITY HARDENING AND RELEASE GATE remains mandatory.
