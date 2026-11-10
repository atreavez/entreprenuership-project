# AssetTrust v0.20 — MFA Security and Kali Linux Verification Runbook

**Compiled by: Aturinzire Hargreave**  
Status: development checkpoint; NOT approved for production.

## What changed and why

Prior to v0.20, disabling MFA invalidated other sessions but left the *current session's* `mfa_verified_at` timestamp in place. A parcel-boundary review checked that timestamp but did not join the MFA credential record. Consequently, a surveyor with an existing step-up authorization could potentially review a parcel after disabling MFA, until the fifteen-minute timestamp expired.

Now `disableMfa` clears this timestamp for the user's *all* sessions within the same transaction that deletes MFA credentials and revokes other sessions. The parcel-review query also requires `auth_mfa_credentials.enabled=true`, checks session expiry and revocation, and locks credential/session records for the duration of the review transaction. This combination prevents stale step-ups and serializes a concurrent MFA-disable against review authorization.

These checks are **additional** to independent accredited surveyor status, asset access, and separation-of-duties checks. Geometric review is not proof of legal land title or ownership.

## Offline tests that can run without database/npm dependencies

```bash
npm run verify:v20
npm run verify:v18
npm run verify:v19
npm run verify:architecture
npm run verify:syntax
```

The new test harness transpiles actual TypeScript methods and exercises them using controlled in-memory SQL substitutes. It is **not** a PostgreSQL integration test.

## Connected Kali Linux dependency setup

```bash
node -v                             # Node >= 22.12
npm ping --registry=https://registry.npmjs.org
npm install                        # review package.json and resolved packages first
# Carefully review the generated package-lock.json and commit it to your repository.
npm ci
npm run release:gate:v17
npm run verify:v20
npm test
npm run build
```

Never invent or manually fabricate a lockfile. Fix compilation failures rather than removing security checks or disabling strict TypeScript.

## Live database / API verification (DISPOSABLE ENVIRONMENT ONLY)

1. Use **only a fresh, isolated database**. Do not run migrations on an existing or production database without a verified backup and the v0.11 baseline procedure.
2. Copy `.env.example` into `.env`. Configure `DATABASE_URL`, `WEB_ORIGIN`, and separate `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, and `DOCUMENT_ENCRYPTION_KEYS` from `openssl rand -hex 32`. Do not commit `.env`.
3. Start PostgreSQL/PostGIS: `docker compose up -d postgres` (if Docker is available). Check that `DATABASE_URL` references this disposable database.
4. Apply `npm run db:migrate` and `npm run db:check` to a fresh database only.
5. Start the application and validate health and readiness separately. In an isolated test environment with a fresh matching E2E identity marker, run `npm run test:e2e:ci`. This script **creates and changes test records**. Follow `docs/V13_INTEGRATION_AND_CI_RUNBOOK.md` for safe environment preparation.
6. Manually check (and automate) the following with a disposable SURVEYOR account and parcel: enable MFA, perform step-up, disable MFA, attempt a sensitive parcel review, expect rejection. Re-enroll MFA, perform fresh step-up, and retry as a different accredited reviewer with appropriate permissions. Verify the audit trail and no unauthorized parcel update.
7. Validate that a concurrent MFA-disable transaction and parcel-review transaction cannot both authorize a review in a way that violates step-up requirements.

## Unresolved release gates

- Authenticate npm install, generate/commit real lockfile, run `npm ci`.
- Pass full NestJS + React TypeScript builds.
- Pass live PostgreSQL/PostGIS migrations and the new MFA downgrade scenario.
- Pass browser end-to-end and privacy/tenant-isolation tests.

**Do not use v0.20 as a production deployment until those gates pass.**
