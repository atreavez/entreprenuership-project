# AssetTrust v0.29 — Kali Linux installation and verification

**Compiled by Aturinzire Hargreave.** Follow this procedure in a **disposable development environment**. Production upgrades require backups, a staging rehearsal, and an approved release.

## 1. Extract the complete checkpoint
```bash
cd ~/Downloads
unzip AssetTrust_v29_Member_Role_Permission_Control_Checkpoint.zip
cd assettrust-v29
node --version
npm --version
```
The project requires Node >=22.12. Do not mix this checkout with an older running server or database unintentionally.

## 2. Establish reproducible dependencies
```bash
npm install --package-lock-only
npm ci
npm run verify:v29
npm run verify:architecture
npm run verify:syntax
npm run release:gate:v17
npm run build
```
**Important:** `package-lock.json` was not generated in this sandbox, because npm packages cannot be installed here. Generate it from the real project on a connected machine, review it, commit it and then run `npm ci`. Do not fabricate an npm lockfile. If compilation fails, preserve the entire stdout/stderr and fix the actual TypeScript errors before attempting live integration.

## 3. Configure and migrate only a test database
- Create `.env` from `.env.example` and provide **independent**, strong secrets for JWT, MFA and document encryption. Preserve existing encryption keys when upgrading records.
- Start the project's documented PostGIS `postgres` service or a separate local PostgreSQL + PostGIS database. Do not reuse production credentials.
- On a **fresh disposable database**, apply the migration ledger:
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```
- On a database already at v0.28 with an **authentic, matching ledger**, the migrator should append only `010_member_management.sql`. Do not run the v0.11 legacy baseline procedure against an already-versioned database.
- Verify `users.suspended_at`, `users.suspended_by`, `users.suspension_reason`, and `member_role_proposals` exist. Confirm recorded ledger SHA-256 matches `schema-manifest.ts`.

## 4. Disposable PostgreSQL verification
This script rejects non-loopback DB hosts, database names not ending `_ci` or `_test`, incorrect `NODE_ENV`, and requests without explicit mutation consent. All fixtures are wrapped in one rollback transaction.
```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export DATABASE_URL='postgres://assettrust:YOUR_LOCAL_TEST_PASSWORD@127.0.0.1:5432/assettrust_ci'
npm run test:pg:members:v29
```
**Never** run the test with a production password, URL or database. It verifies SQL constraints; it does not replace a full NestJS HTTP test.

## 5. Manual two-administrator acceptance scenario
1. Use a disposable tenant with two separately provisioned administrators, each with active MFA.
2. Sign in as admin A, complete fresh MFA step-up in Account Security, open **Members & Permissions**, and request `CLIENT` → `REVIEWER` with a meaningful reason.
3. Confirm the member remains `CLIENT` while the proposal is pending; admin A cannot approve their own request.
4. Sign in independently as admin B, perform fresh MFA, approve and verify the change appears in the member directory and audit trail. Confirm prior member sessions are revoked.
5. Repeat for a `SURVEYOR` candidate and confirm the member is **not accredited** without the professional trust process.
6. Suspend the user and confirm subsequent login, refresh, and pending MFA login challenge are rejected. Restore and verify a new login is required.
7. From another tenant, verify the member, proposals, and mutation endpoints do not expose the first tenant's records.
8. From the ordinary role editor, try `ORG_ADMIN`; it must be rejected. Co-admin onboarding must continue via the separate privileged invitation process.
9. Reassign any open cases cleared during a role transition. Check that the history and audit entries accurately name both administrators.

## 6. Remaining release blockers
- Genuine `npm ci` and full API + web production build.
- Live PostGIS migration, member lifecycle and tenant isolation checks.
- Real API/React end-to-end, race, authentication and browser testing; verification of all workflow interactions after suspension.
- A reproducible CI pipeline run; authenticated staging review; operational backup and restore exercise.

**Status:** offline-tested engineering checkpoint, **not approved for deployment**.
