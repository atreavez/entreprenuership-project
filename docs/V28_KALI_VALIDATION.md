# AssetTrust v0.28 — Kali Linux Build and Administration Runbook

**Prerequisites:** Node.js 22+, npm, PostgreSQL with PostGIS, correctly configured `.env`, a **disposable test database** for integration tests, and a reviewed database backup when upgrading. Never paste private secrets into this document or source control.

## Fresh installation

```bash
cd ~/Downloads
unzip AssetTrust_v28_Admin_Control_Plane_Checkpoint.zip
cd assettrust-v28
cp .env.example .env
```

Edit `.env` and set genuine separate secrets and a suitable `DATABASE_URL`. Do not rotate the existing document encryption key when upgrading a database containing previously encrypted files.

```bash
npm install
npm ci
npm run verify:v28
npm run verify:architecture
npm run verify:syntax
npm run release:gate:v17
npm run build
```

If the machine cannot reach npm, **stop** and resolve the registry issue. Do not fabricate a `package-lock.json`, disable the release gate or claim a successful build.

For a **fresh disposable database**, start PostGIS and apply migrations:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

For an **existing v0.27 database**, take and verify a backup, confirm the existing migration ledger has all 001–008 hashes, and run the normal `db:migrate` to apply only pending 009. **Do not run `db:baseline` if a ledger already exists.** The legacy baseline procedure intentionally records at most the eight reviewed earlier migrations, leaving 009 pending for real execution; use only if the historical schema truly matches and the documented backup checks have been performed.

Run API and web in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Use the local web URL from Vite, normally `http://localhost:5173`, and navigate to **Admin Control Plane** under the administrator account. The frontend uses the authenticated same-origin API, not a public third-party mapping or settings service.

## MFA and independent approval

1. An `ORG_ADMIN` first enrolls and confirms authenticator MFA using **Account Security**.
2. Before saving settings, complete a fresh MFA step-up through the existing security UI. The backend rejects writes without recent step-up.
3. Ordinary settings apply immediately with optimistic version validation and audit history.
4. High-impact settings create `PENDING` proposals; another authorized administrator must independently step up and choose `APPROVE` or `REJECT`. The proposer cannot approve their own change.
5. The v0.27 co-administrator invitation path can onboard the second organization administrator. The co-admin must activate mandatory MFA before workspace access.

## First Platform Super Admin bootstrap (trusted DB operator only)

This is **not** a public API or an automated self-election feature. Complete review and approval in your own operator process and choose an existing `ORG_ADMIN` whose MFA is enabled.

```bash
# Dry run first. DATABASE_URL is read from .env.
ASSETTRUST_PLATFORM_ADMIN_EMAIL='real-admin@your-domain.example' \
 npm run bootstrap:platform:v28

# Trusted operator action AFTER approvals and a verified backup:
ASSETTRUST_PLATFORM_ADMIN_EMAIL='real-admin@your-domain.example' \
ASSETTRUST_BOOTSTRAP_EMAIL='real-admin@your-domain.example' \
ASSETTRUST_BOOTSTRAP_CONFIRM='I_AUTHORIZE_PLATFORM_ADMIN' \
 npm run bootstrap:platform:v28 -- --apply
```

**Use your own actual email instead of the examples.** The bootstrap refuses if any platform appointment has already been bootstrapped, if the target account lacks confirmed enabled MFA, or if confirmation is missing. A platform administrator's organization remains separate from other organizations' private data. Further appointment delegation and revocation require a future audited management workflow; do not manually rewrite appointment or audit tables.

## Disposable PostgreSQL integration test

Never use a production DB. Configure an isolated local test DB with a name ending `_test` or `_ci` and use:

```bash
NODE_ENV=test ASSETTRUST_E2E_ALLOW_MUTATION=YES \
 DATABASE_URL='postgres://assettrust:your-test-password@127.0.0.1:5432/assettrust_test' \
 npm run test:pg:admin:v28
```

The script refuses anything other than an explicit disposable, loopback-only test target and wraps all fixtures in `ROLLBACK`. The command is an example only; the current workspace has **not** run this test against PostgreSQL.

## Troubleshooting release blockers

- `npm ci` reports missing lockfile: run a real `npm install` on a connected machine and commit the generated lockfile after review.
- `TS2688 Cannot find type definition file for 'node'`: dependencies are missing; installing a complete, compatible dependency tree is the first step. Other errors may appear afterward.
- PostgreSQL/PostGIS readiness failure: check `docker compose ps`, port, credentials and migrations; do not bypass startup readiness policy.
- Admin interface gets 403: inspect current ORG_ADMIN membership, active session, MFA step-up, and the separate platform appointment. UI visibility does not imply backend permission.
- Pending changes cannot be approved by the proposer, even on another device; use a different authorized administrator.
- Billing and workflow designer controls are not live in v0.28. Stored metadata alone does not activate those operations.
