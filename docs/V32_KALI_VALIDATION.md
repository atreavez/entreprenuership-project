# AssetTrust v0.32 — Kali Linux validation and upgrade

**This is a development build, not a production release. Do not run integration data tests against an existing or production database.**

## 1. Extract the checkpoint

```bash
cd ~/Downloads
unzip AssetTrust_v32_Published_Content_Integration_Checkpoint.zip
cd assettrust-v32
```

## 2. Install exact dependencies from the authentic npm lockfile

This environment could not reach npm and the historical archive did **not** contain `package-lock.json`. On a connected Kali workstation:

```bash
node --version
npm --version
npm install --package-lock-only
npm ci
npm run release:gate:v17
npm run build
```

Commit the reviewed npm-generated lockfile to version control. Do not fabricate a lockfile. If `npm run build` reports TypeScript errors after installation, treat them as defects and resolve them before deployment.

## 3. Run offline tests

```bash
npm run verify:v32
npm run verify:v31
npm run verify:architecture
npm run verify:syntax
```

## 4. Set up a separate PostGIS database

Follow the existing v0.11 migration runbook for fresh-vs-existing schema rules. Back up existing data and preserve encryption secrets; DO NOT baseline or reset a current database without review. After checking the existing migration ledger:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```

v0.32 has **no new database migration**; it needs migration 012 already applied.

## 5. Start the app

```bash
npm run dev:api
# in another terminal
npm run dev:web
```

Use a development `.env` with secure, independent JWT/MFA/document-encryption keys. Never copy production encryption keys into a disposable test workspace.

## 6. Manually verify published integrations

- In an **ORG_ADMIN** account, open **Content & Templates** and propose a change to `report.summary` with a reason. It must remain pending.
- A *different* authorized admin with recent MFA approves it. Only after approval should a generated report draft display the new wording and revision.
- Assign a case to an eligible member; confirm the member's in-app notification uses the published `notification.case_assigned` wording. Confirm no email/SMS delivery is claimed.
- For global website copy, use a **Platform Super Admin** account to propose and independently approve `website.hero_title`. Confirm the login screen uses the new text.
- Verify `GET /api/v1/public-content/report.summary` returns `404` rather than leaking private organization text.
- Confirm the report keeps non-official legal notices even after template changes.

## 7. Run disposable-only PostgreSQL contract tests

Only on a dedicated **disposable, localhost** test database whose name and connection settings meet the safety policy:

```bash
ASSETTRUST_E2E_ALLOW_MUTATION=YES \
DATABASE_URL='postgres://assettrust:TEST_PASSWORD@127.0.0.1:5432/assettrust_ci' \
npm run test:pg:publish:v32
```

The PostgreSQL test uses one transaction and rolls back all test records. Its target validation refuses remote/production-like databases. The command above is an example only: configure the actual disposable credentials and service from your CI or test environment. Do not use production credentials.

## Current release decision

**BLOCKED.** Successful offline policies and source previews are not proof of complete integration. Required next evidence: `npm ci`, full `npm run build`, PostgreSQL contract scripts, end-to-end HTTP, and browser workflow tests.
