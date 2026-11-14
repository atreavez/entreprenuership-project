# AssetTrust v0.45 - Kali Linux Build and Security Validation

**Read before running commands:** Use a disposable, backed-up PostgreSQL/PostGIS database. Never run the contract suite against a production or personal-data database. v0.45 migration is forward-only. Existing migrations must be verified; do not use `db:baseline` to skip any upgrade.

## 1. Extract and set up

```bash
cd ~/Downloads
unzip AssetTrust_v45_Distributed_Login_Security_Checkpoint.zip
cd assettrust-v45
node --version  # v22.12 or later
npm --version
cp .env.example .env
```

Provide real distinct `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `DOCUMENT_ENCRYPTION_KEYS`, `DOCUMENT_ACTIVE_KEY_ID`, `DATABASE_URL`, `WEB_ORIGIN` and a separate `LOGIN_ABUSE_PEPPER`. Keep secret values only in your local environment/secret manager, not in Git or in browser `VITE_*` variables. To generate the login pepper:

```bash
openssl rand -hex 32
```

Copy the output **privately** into `LOGIN_ABUSE_PEPPER` in `.env`. The pepper must be the same on all API nodes and must survive restarts; rotating it invalidates the keyed counter identities and changes enforcement windows. Do not reuse encryption or MFA keys.

## 2. Reproducible dependency installation

The supplied ZIP does not contain an authentic npm lockfile. On a connected, trusted development machine, after reviewing manifests and dependency provenance, run:

```bash
npm install --package-lock-only
# Inspect package-lock.json and commit it to a reviewed private repository.
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm test
```

Do not fabricate a lockfile, ignore high/critical findings, or run `npm install --force` blindly. The checkpoint environment could not execute these steps successfully.

## 3. Offline verification

```bash
npm run verify:v45
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v41
npm run security:scan:v43 -- --history
```

**Important:** A Git-history scan requires the canonical repository `.git` directory. The ZIP contains source without history, so `--history` must not be interpreted as complete from this archive.

## 4. Back up the database, migrate, and check

```bash
# Back up your own authorized test DB and verify restore separately.
# Check DATABASE_URL points to a disposable PostgreSQL/PostGIS instance.
npm run db:migrate
npm run db:check
```

Migration `020_distributed_login_abuse.sql` adds `auth_login_abuse_windows` with only keyed digest and aggregate timestamps. All 19 prior migrations are unchanged.

## 5. Guarded live PostgreSQL contract (test-only)

This command is safe **only** after you verify the database is localhost and is explicitly named as a disposable `_ci` or `_test` instance. The guard fails before importing `pg` otherwise.

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
# DATABASE_URL must already point to a disposable loopback *_ci / *_test DB.
npm run test:pg:login-abuse:v45
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

The runner uses multiple PostgreSQL connections for concurrent attempt reservations. It inserts only synthetic random digest rows and removes them in `finally`; it does **not** exercise real customer accounts. Run other historical contract suites and authenticated browser tests after this.

## 6. Manual adversarial checks to record

1. Confirm password-only successful login clears only that identity's counter.
2. Confirm ten failed logins can be recorded; the eleventh attempt on a second API instance returns HTTP 429 before Argon2 runs.
3. Confirm a valid password plus **wrong MFA** does not clear the account counter, and successful MFA clears it.
4. Confirm unknown emails and known emails follow the same counter behavior; do not expose whether an account exists.
5. Confirm a locked account stays locked across server restarts and across both API processes until the DB deadline.
6. Confirm database outage makes login unavailable, not unaudited or unthrottled.
7. Verify legitimate-user denial-of-service mitigations, helpdesk recovery and source-based edge protection.
8. Verify production TLS/HSTS, cookie security, tenant isolation, backup restoration, mail delivery, malware scanning and dependency security separately.

Record timestamps, redacted logs, command exit codes, version identifiers, HTTP status, DB evidence and screen captures without storing real secrets. Release is blocked until every required control is verified.
