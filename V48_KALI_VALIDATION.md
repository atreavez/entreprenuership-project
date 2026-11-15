# AssetTrust v0.48 — Kali Linux validation guide

**Development only — production NO-GO.** Use a dedicated, disposable PostgreSQL/PostGIS database on localhost. Never point mutating tests at existing customer records. Do not paste passwords, signing keys or database URLs into chats or Git.

## A. Preserve history and data

In the actual Git clone, inspect `git status`, applied migration hashes and environment configuration. Back up your existing PostgreSQL database and restore the backup to **a separate test database** to prove recoverability. Preserve document-encryption/signing keys in secure storage. Do not re-run `db:baseline`, edit old migrations, or run old API nodes against migration 023.

## B. Install dependencies honestly

```bash
cd ~/Downloads
unzip AssetTrust_v48_Case_Evidence_RLS_Checkpoint.zip
cd assettrust-v48
node --version
npm --version
npm install --package-lock-only  # Generate the REAL dependency graph; review changes
npm ci                         # Must pass after lockfile review
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

Do not fabricate a lockfile or silence vulnerability findings. Pin/review approved updates before production. Keep secret values in environment/secret manager, not in the frontend bundle.

## C. Offline regression checks

```bash
for n in $(seq -w 3 48); do npm run "verify:v${n}" || exit 1; done
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v41
npm run security:scan:v43
```

On the **full Git clone** (not the ZIP), additionally scan the entire Git history with an approved Gitleaks/TruffleHog equivalent; investigate matches and rotate all actually exposed credentials. A clean current-source scan is insufficient.

## D. Disposable database validation

Create a completely separate database named `assettrust_ci` or `assettrust_test` with PostGIS on `127.0.0.1` or `localhost`. Use test-only credentials and no customer data. Configure `DATABASE_URL` in your *local shell/secret configuration*, not in a checked-in file. Before executing the following, inspect `tools/pg-e2e-policy-v21.cjs` and verify the intended target.

```bash
export NODE_ENV=test
# DATABASE_URL must be a local disposable *_ci or *_test database.
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
npm run db:migrate
npm run db:check
npm run test:pg:core-relations:v47
npm run test:pg:layout-rls:v46
npm run test:pg:evidence-rls:v48
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

For read-only RLS coverage audit, connect as an authorized database auditor (using secure PostgreSQL credential handling) and run:

```bash
psql -X -v ON_ERROR_STOP=1 -f tools/sql/v48-rls-readonly-audit.sql
```

Verify ordinary runtime roles are NOT superusers, owners of protected tables or holders of BYPASSRLS, that missing tenant context returns no private case evidence, and that org A cannot query org B's evidence. Test rollback, pool reuse, API authorization, case workflows, report generation and recipient downloads.

## E. Mandatory go/no-go decision

A passing offline matrix cannot approve release. Require a genuine clean build, live contracts on an isolated DB, least-privilege runtime roles, HTTPS/secure cookies and CSRF verification, upload malware controls, full Git-history scan, dependency vulnerability remediation, restore drill, authenticated browser tests, two-API testing, security review, and complete RLS rollout or explicitly accepted non-RLS controls for all sensitive records. High/critical findings block release.
