# AssetTrust v0.40 — Kali Linux installation, upgrade and verification

**Important:** This is an offline-tested development checkpoint, not a production release. No real personal land evidence or external customers until the gates below are passed. Never point disposable E2E commands at a production database.

## 1. Archive and source checks

```bash
cd ~/Downloads
sha256sum -c AssetTrust_v40_SHA256SUMS.txt
unzip AssetTrust_v40_Shared_Recipient_Access_Hardening_Checkpoint.zip
cd assettrust-v40
node --version   # >= 22.12
npm --version
node tools/release-readiness-v40.cjs
```

The last command is **read-only** and exits nonzero when prerequisites are missing. A successful preflight is still not permission to release.

## 2. Resolve inherited dependency blocker

The source checkpoint does **not** contain a genuine `package-lock.json`, and the isolated packaging environment could not reach the npm registry. On a trusted connected Kali machine:

```bash
npm install --package-lock-only
# Review the generated package-lock.json and dependency versions for your organization.
npm ci
npm run verify:v40
npm run verify:v39
npm run verify:architecture
npm run verify:syntax
npm run build
```

Do not invent a lockfile or replace a failing install with a fake success. Do not run installs as root. The source transpilation check is **not** equivalent to the full build or type checking.

## 3. Existing database upgrade — privileged action

Before changing any existing environment: verify a recoverable backup, preserve existing encryption and signing keys, and confirm prior migration history and SHA-256 fingerprints. In particular do not reset, baseline or skip migrations merely to bypass an error.

```bash
cp .env.example .env
# Fill with separate securely generated secrets; protect permissions and never commit .env.
chmod 600 .env
# Confirm DATABASE_URL identifies an authorized test/development database.
npm run db:check
npm run db:migrate
npm run db:check
```

When upgrading from v0.39, migration `018_recipient_attempt_windows.sql` must append once. A database older than v0.39 will need all missing migrations in order and explicit operator approval. `db:baseline` is **not** a shortcut.

## 4. Disposable PostgreSQL contract — TEST DATABASE ONLY

The following runner uses the existing local-only disposable database policy and creates test-only records inside one transaction which is rolled back. Do not weaken the safety guard.

```bash
# Ensure DATABASE_URL is loopback and its database name satisfies the *_test / *_ci policy.
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
npm run test:pg:attempts:v40
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

It tests the new FK tenant isolation, monotonic counters, cap and anti-deletion trigger. Passing it is **not** proof of full HTTP concurrency or browser integration.

## 5. Manual authenticated end-to-end matrix

Use two distinct active organization admin accounts with recent MFA; a disposable issued report; and a separate recipient browser session. Start the API and web development servers with approved test configuration:

```bash
npm run dev:api
# In another terminal from the repository root:
npm run dev:web
```

1. Admin A proposes a share; Admin B approves it. Verify neither admin may approve their own proposal.
2. Recipient with both correct credentials downloads the PDF+receipt. Verify receipt against an independently pinned public key. Confirm redemption count increments once.
3. Use wrong credentials nine times on a freshly approved disposable share; inspect admin warning after five. Verify the tenth failure blocks even the right credentials until the shared 15-minute window expires.
4. Repeat requests through **two separately deployed API instances** connected to one test database, demonstrating a shared counter and no bypass by changing instances.
5. Verify revoked, expired, exhausted, withdrawn, disputed, superseded and altered reports never download. Verify a different organization cannot see the warning.
6. Confirm secrets do not appear in browser URL/history, server logs, proxy logs, audit details or analytics. Review WAF/network throttling separately: unknown share IDs do not consume shared counter rows.
7. Use an approved test backup to demonstrate recovery. Perform full regression, dependency scans and independent security review before any production decisions.

## 6. Interpreting results

- `npm run release:preflight:v40` is **informational and read-only**. Any `BLOCK` is a hard prerequisite to investigate; it does not run live tests.
- `npm run verify:v40` runs focused policy, migration, mock service and read-only release gate tests.
- `npm run verify:v03` through `npm run verify:v40` should all pass, but many historical suites use mocks or syntax checks.
- This checkpoint still needs a genuine clean install/build, live Postgres migration, two-server concurrency verification and authenticated browser tests.
