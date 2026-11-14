# AssetTrust v0.75 — Kali Linux and live acceptance guide

**Use a disposable local test environment only.** Never run synthetic mutations against production, customer data, shared databases or an unreviewed PostgreSQL volume. Do not publish secrets, authorization headers, database URLs, or full raw logs. The archive deliberately lacks a genuine lockfile and `.git` history.

## 1. Extract and verify

```bash
mkdir -p ~/Projects/assettrust-v75-review
unzip ~/Downloads/AssetTrust_v75_Current_Permissions_and_Core_Workflows_Checkpoint.zip -d ~/Projects/assettrust-v75-review
cd ~/Projects/assettrust-v75-review/assettrust-v75
node --version
npm --version
npm run verify:v75
npm run verify:v74
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v53
npm run security:scan:v43
```

## 2. Restore genuine dependencies and build on a trusted connected system

Use the authentic reviewed `package-lock.json` from the original Git repository if available. If it truly does not exist, review and run the v55 generator on your trusted machine **only after confirming the registry and reviewing dependency changes**:

```bash
# Run ONLY when package-lock.json is absent and project source/registries are reviewed.
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run build:acceptance:plan:v68
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

Stop at the first failed step. Do not use `--force`, `--legacy-peer-deps`, ignored audit errors or temporary security bypasses to claim acceptance. Preserve only redacted evidence.

## 3. Disposable PostgreSQL/PostGIS and ClamAV

Review `compose.integration-v70.yaml`, local port availability, restricted role, private file permissions and the expected database identity. The prepare command **must not** run against a pre-existing local v70 instance or any production volume. For a fresh disposable environment only:

```bash
npm run kali:integration:plan:v70
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:inspect:v73
```

After the genuine build and vetted migrations are ready, follow the full v70/v71 handover to start PostGIS and ClamAV, apply migrations and provision the non-owner runtime role. The existing supervised live acceptance command is:

```bash
NODE_ENV=test ASSETTRUST_V70_LOCAL_CONFIRM=YES \
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
npm run kali:acceptance:run:v73
```

That historical command exercises existing suites. **It does not automatically assert the new v0.75 cases below.**

## 4. Witness v0.75 authorization and concurrency behavior

Use two synthetic organizations A and B and independently authenticated accounts: current A-admin, demoted/suspended former A-admin, A-client, A-reviewer and B-admin. Test request-time role transitions in a staging database with separate connections; never update a real user's privileges merely for testing.

- Verify A-admin can list, read and create assets, read organization cases, and list case evidence where permitted. A-client/reviewer should see only their own or explicitly permitted resources; a read-only asset grant must never reveal confidential case evidence.
- During an active A-admin session, demote that actor to CLIENT or suspend them. Reuse the earlier session token. GET `/api/v1/assets`, GET `/api/v1/assets/:id`, POST `/api/v1/assets`, GET `/api/v1/cases`, GET `/api/v1/cases/:id`, and GET `/api/v1/cases/:id/evidence` must respect **current** database roles. Sensitive objects outside the actor's participation must be unavailable.
- Use two DB connections to exercise `FOR SHARE` locks: while the protected asset-create/asset-read/case-read transaction is in progress, attempt role change or suspension; verify appropriate wait/serialization or configured lock timeout. Invert the race so demotion commits first; the protected action must be denied.
- Attempt cross-organization IDs and stolen-read-only-grant scenarios. Verify tenant RLS and database role restrictions independently, that denial produces no asset insert/audit, and no privileged response contains another tenant's data.
- Verify case readiness, transitions, admin control plane, payment entitlement, encrypted documents, malware screening, password reset, MFA, browser flows, HTTPS and secure deployment separately. Do not infer these passed from the new v0.75 unit suite.

## 5. Evidence and release gate

Record exact failing **step name**, exit code, test file and redacted error summary. Keep raw DB and security logs private and out of Git. Always leave production approval **NO-GO** until the full final security hardening, penetration tests, backup restore, deployment rollback and real-service acceptance gates pass.
