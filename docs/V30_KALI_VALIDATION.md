# AssetTrust v0.30 — Kali Linux installation and test runbook

**Compiled by Aturinzire Hargreave.** Test with a **disposable staging database**, never a production data store.

## 1. Extract and inspect
```bash
cd ~/Downloads
unzip AssetTrust_v30_Workflow_Admin_Checkpoint.zip
cd assettrust-v30
node --version
npm --version
```
Use Node >=22.12.

## 2. Authentic reproducible dependency installation
```bash
npm install --package-lock-only
npm ci
npm run verify:v30
npm run verify:architecture
npm run verify:syntax
npm run release:gate:v17
npm run build
```
The archive does **not** contain a verified npm-generated `package-lock.json`. Generate and review it on a connected Kali machine, commit it, and rerun `npm ci`. Do not hand-author a lockfile. The container used for this checkpoint does not have the NestJS/React dependencies available for the full production build.

## 3. Prepare disposable PostgreSQL + PostGIS
1. Copy `.env.example` to `.env`; configure separate strong JWT, MFA and document-encryption keys. Keep the existing encryption keyring when upgrading stored documents.
2. Use the project PostGIS container or an isolated local database. Never point a test or migration to production.
3. New disposable database:
```bash
docker compose up -d postgres
npm run db:migrate
npm run db:check
```
4. On a previously migrated v0.29 database, verify a tested backup and matching migration ledger first. The migrator should append **only** `011_workflow_admin.sql`. Never rerun the legacy baseline on a versioned database.
5. Inspect tables `workflow_stage_policies` and `workflow_stage_policy_changes`, and verify checksum of migration 011.

## 4. Rollback-only SQL integration test
Only in a disposable local database whose name ends in `_test` or `_ci`, with explicit consent:
```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export DATABASE_URL='postgres://assettrust:YOUR_LOCAL_TEST_PASSWORD@127.0.0.1:5432/assettrust_ci'
npm run test:pg:workflows:v30
```
This test verifies real SQL tenant constraints, duplicate proposals, mandatory-evidence restrictions, independent approval and revision records. It wraps all fixtures in one transaction and rolls them back. It was **written but not executed** in the sandbox because PostgreSQL and npm dependencies were unavailable.

## 5. Manual real-browser acceptance test
1. Prepare two separate current ORG_ADMIN accounts with active MFA in one disposable organization; prepare an ORG_ADMIN in a different organization.
2. Log in as admin A, complete fresh MFA, open **Workflow Designer**, choose `FIELD_INSPECTION`, set 10 target days, reminder 3 and extra `DOCUMENT` evidence. Add a detailed reason and submit a proposal.
3. Verify the active stage version and readiness remain unchanged while the proposal is `PENDING`. Admin A must not approve or reject their own proposal.
4. Log in as admin B, complete fresh MFA, approve the pending proposal. Verify active version increments, audit event is recorded and the change list shows both administrator identities.
5. On a disposable field-inspection case with accepted `FIELD_REPORT` only, verify readiness includes `ADDITIONAL_EVIDENCE_NOT_ACCEPTED` and advancement is rejected. Add a separate `DOCUMENT` submission accepted by a different qualified reviewer; readiness should now permit advancement if the other checks pass.
6. Confirm the original mandatory evidence and professional accreditation rules cannot be switched off. Confirm unresolved disputes still block progression.
7. From a different organization, attempt to access the proposal, active setting and decision endpoint. Expect no cross-tenant disclosure or edit.
8. Attempt stale-version submissions, duplicate pending revisions, revoked MFA and suspended administrators. All must fail closed.
9. Check audit events, server logs, responsive mobile layout and no third-party map requests for private overlays.

## 6. Release blockers
- Authenticated `npm ci` and full NestJS/React build on a connected machine.
- Live PostGIS migration and SQL constraints.
- Running end-to-end browser tests for two-admin approvals, current sessions and evidence advancement.
- CI run with preserved build/test evidence, staging backups, recovery rehearsal and security review.

**Release decision: NOT PRODUCTION-READY.** Offline tests and static source previews are not sufficient proof of production correctness.
