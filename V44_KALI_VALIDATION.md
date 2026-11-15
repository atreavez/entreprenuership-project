# AssetTrust v0.44 - Kali Linux Security Validation and Upgrade Guide

**Important:** Perform database migration tests against a disposable copy or fresh test DB only. Back up and verify restoration of any existing database first. Never target production with integration tests.

## Extract and review

```bash
cd ~/Downloads
unzip AssetTrust_v44_Password_Recovery_Security_Checkpoint.zip
cd assettrust-v44
node --version     # 22.12+ required
npm --version
npm run verify:v44
npm run verify:ci:v41
npm run verify:architecture
npm run verify:syntax
npm run security:scan:v43
```

## Obtain a genuine dependency lockfile

The source checkpoint does NOT include a verified npm lockfile. Use an approved network and dependency review process:

```bash
npm install --package-lock-only --ignore-scripts
# Examine package-lock.json before committing it.
# Reject unexpected registries, suspicious scripts, vulnerable or unused dependencies.
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

Do not run `npm audit fix --force` blindly. Upgrade vulnerable dependencies deliberately, run tests, and create a reviewed Software Bill of Materials (SBOM).

## Disposable PostgreSQL

Configure `.env` with **random, unique** application secrets (JWT, MFA, document keyring) and a localhost PostGIS database named `assettrust_ci` or `assettrust_test`. Never reuse customer credentials or existing customer evidence.

```bash
cp .env.example .env
# Edit secrets securely; do not check .env into Git.
# Use ONLY an authorized disposable DB and verified PostGIS instance.
npm run db:migrate
npm run db:check
NODE_ENV=test ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:reset:v44
```

The integration test refuses production mode, remote PostgreSQL and non-disposable database names. Test fixtures use a transaction that must roll back.

## Configure secure password recovery (server-only)

Use a controlled and verified mail-relay adapter accepting HTTPS POST JSON `{to, subject, text}` with an Authorization Bearer token. The adapter must never redirect. Add the following **only to server environment/secret manager**, not `VITE_*` or a browser config:

```text
PASSWORD_RESET_RELAY_URL=https://your-verified-mail-relay.example/v1/messages
PASSWORD_RESET_RELAY_TOKEN=<provider-managed-secret-with-at-least-32-characters>
PASSWORD_RESET_PUBLIC_ORIGIN=https://your-deployed-web-origin.example
PASSWORD_RESET_LOOKUP_PEPPER=<32-random-bytes-encoded-as-hex>
WEB_ORIGIN=https://your-deployed-web-origin.example
```

Generate the lookup pepper locally with `openssl rand -hex 32`. Do not commit it or reuse another encryption/signing secret. **Recovery remains disabled** if these settings are absent or invalid. Prove relay identity, successful delivery and failure behavior before using actual customer email addresses.

## End-to-end checklist on a test deployment

1. For a known test account, request a link and verify that the browser sees only a generic message; for a nonexistent account, the response wording is identical.
2. Confirm the emailed fragment link expires within 15 minutes and has no token in HTTP request URL, referrer, logs, analytics or screenshots.
3. Redeem once and verify the DB stores an Argon2id password hash and a consumed reset record; a second redemption must fail.
4. Verify reset of a revoked or expired link fails without changing password; a failed relay must invalidate the newly created token.
5. Verify **all** old refresh sessions/access tokens and MFA-login challenges stop working after a successful reset. Login still enforces MFA.
6. Run simultaneous resets and two-server redeems; only one success may be committed. Test credential reuse, user suspension, abusive request counts, cross-origin POST and CSRF attacks.
7. Inspect administrator and audit logs: event recorded without exposing reset secrets or email relay credentials.
8. Run all legacy CI checks and security gates; independently confirm TLS, backups, private PostgreSQL exposure, authorized SSH policy and key custody.

## Full Git history secret scanning

Run from your *canonical Git clone*, not this ZIP:

```bash
git fetch --all --tags --prune
git rev-parse --is-shallow-repository  # must be false
npm run security:scan:v43 -- --history
# Also run Gitleaks/TruffleHog at a reviewed current version.
```

Rotate any confirmed exposed secrets **with the original provider** and invalidate linked sessions. Editing repository history alone cannot revoke keys.

## Release decision

This checkpoint's offline test success **does not approve production deployment**. See `V44_SECURITY_REPORT.md` and `SECURITY_FINALIZATION_STANDARD.md` for every remaining release gate.
