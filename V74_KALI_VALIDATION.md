# AssetTrust v0.74 — Kali validation and live security acceptance

**Scope:** disposable local development/staging only. **Do not** use production, customer records, an existing shared database, a remote Docker engine, or an unreviewed PostgreSQL volume. Never paste `DATABASE_URL`, JWTs, MFA secrets or `.env` into chats.

## 1. Prepare the source checkpoint

```bash
mkdir -p ~/Projects/assettrust-v74-review
unzip ~/Downloads/AssetTrust_v74_Current_Role_Authorization_Checkpoint.zip -d ~/Projects/assettrust-v74-review
cd ~/Projects/assettrust-v74-review/assettrust-v74
node --version
npm --version
npm run verify:v74
npm run verify:architecture
npm run verify:syntax
npm run build:source:v56
npm run security:scan:v43
```

The self-contained verification is expected to pass. If you have an authentic Git clone, run the original-history secret audit there; the ZIP has no `.git` metadata.

## 2. Restore an authentic, reviewed dependency installation

Do not create an invented or manually modified lockfile. Prefer the reviewed `package-lock.json` from the original, trusted repository. If none exists, inspect the project's existing v55 lockfile creation procedure **on a network-connected machine** and review the registry, resolved dependencies and lifecycle scripts before committing it:

```bash
# ONLY if package-lock.json does not already exist in this trusted checkout:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run build:acceptance:plan:v68
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

Do not ignore audit findings, alter build evidence or use `|| true`. The built API and frontend must both pass artifact provenance checks. A failed command blocks further acceptance.

## 3. Run disposable PostGIS and ClamAV integration

Review the existing v70 Docker Compose file, local ports, private credential directory, and separate `assettrust_test` database. For a **new** approved fixture only, run:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:inspect:v73
```

Do not rotate generated passwords against an existing volume. When build/migration/roles/ClamAV are ready, run the supervised seven-stage acceptance (the v71 runner is compatible with v0.74):

```bash
NODE_ENV=test ASSETTRUST_V70_LOCAL_CONFIRM=YES \
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
npm run kali:acceptance:run:v73
```

This exercises the existing document-revocation journey, but does **not** automatically prove the new v74 administrator-demotion behavior. Preserve only sanitized failed step IDs, exit codes and timing in your handover.

## 4. Manual/API security acceptance checklist (must be witnessed)

- With disposable organization A and B, log in as org A administrator and keep that token. Have a separate authorized platform/org management actor **demote** or **suspend** that administrator. With the **old token**, attempts to GET/POST `/api/v1/access/assets/:id/grants` and DELETE `/api/v1/access/grants/:id` must be denied, with no grant/audit write. An unaffected active administrator must still succeed.
- With the same stale token, GET `/api/v1/documents` must not return the organization's document list. Confirm that an active user sees only their own asset documents, assigned case evidence and permitted grants; a read-only asset grant must not show private case evidence.
- While a grant-write transaction holds the administrator membership row `FOR SHARE`, attempt an administrator suspension/role update through a second connection. Confirm it waits or times out according to lock policy; it must not silently race past the transaction. Verify outcomes whichever operation wins first.
- Verify authenticated admin MFA/role isolation, non-owner PostgreSQL RLS, document malware scanning, encryption/digest validation, asset/verification flows, payment authorization, and safe audit records. Use a restored staging copy on the target PostgreSQL major version; record and fix the first actual error.

## 5. Release decision

Even if every disposable test passes, **production remains NO-GO** until the full cross-project security and release gate passes: real credentials and password hashes, independent permission audit, MFA, role/membership changes, RLS negative tests, secrets and complete Git history, HTTPS/SSH restrictions, rate limiting/CSRF, safe uploads and malware scan, server-authoritative payments, tenant and browser integration, backup restore, disaster recovery, versioned rollout/rollback and signed release evidence.
