# AssetTrust v0.76 — Kali Linux and live operations acceptance

**Test/staging only.** Run no synthetic mutation against production, customer data or a shared database. Keep original Git history for secret audits. Do not publish `.assettrust-local`, `.env`, access tokens, DB URLs, raw logs or private credentials.

## 1. Verify the extracted checkpoint

```bash
mkdir -p ~/Projects/assettrust-v76-review
unzip ~/Downloads/AssetTrust_v76_Operations_Authorization_and_Dispute_Concurrency_Checkpoint.zip -d ~/Projects/assettrust-v76-review
cd ~/Projects/assettrust-v76-review/assettrust-v76
node --version      # >= 22.12
npm --version
npm run verify:v76
npm run verify:v75
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v53
npm run security:scan:v43
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v73
```

## 2. Recover verified dependencies and compile

Do **not** use the archived source as permission to overwrite the working original checkout. Prefer `package-lock.json` from the reviewed original Git repository, if present. If and ONLY if it does not exist and the registry/source have been reviewed on trusted connected Kali:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run build:acceptance:inspect:v68
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

Stop at the first failure and read `test-evidence/v68/build-acceptance.json` locally. Do not bypass dependency audits, fake build outputs, or expose application secrets to install hooks.

## 3. Disposable database, verified runtime role and HTTP

Review `V70_KALI_VALIDATION.md` and `V71_KALI_VALIDATION.md` first. Create an isolated new v0.70 local PostGIS/ClamAV environment *only if no previous volume with the same identity exists*. Do not rotate credentials for an existing volume. After verified build and private test configuration, execute the supervisor:

```bash
NODE_ENV=test \
ASSETTRUST_V70_LOCAL_CONFIRM=YES \
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
npm run kali:acceptance:run:v73
```

That command exercises existing supervised tests but **does not automatically establish the new v0.76 mutation races below**. Run v0.76-specific manual acceptance in a local staging fixture; preserve redacted operation/status evidence.

## 4. v0.76-specific adversarial acceptance checklist

With synthetic organizations A and B, use five fresh accounts: active A-admin, A-admin later demoted to CLIENT, active A-reviewer, A-task assignee, B-admin. Use separate connections to change privileges and perform requests.

- **Quote read, create and status change:** only currently active administrators can create and issue/void a quote; a REVIEWER can only list quotes for their own/assigned cases. After demotion or suspension, reuse the earlier token and verify zero unauthorized writes or quote disclosure. Quote creation must not collect payment.
- **Dispute report:** an assigned case participant can report an OPEN case; a suspended member, unrelated user or CLOSED case cannot report. When two reporters contend for the same case, confirm exclusive case locking rather than lock upgrades, and no audit/write on denied requests.
- **Dispute resolve:** create two OPEN disputes on one case. Start RESOLVED updates from two sessions at nearly the same time. After both commit, both disputes must be final and the case must be OPEN. Confirm a demoted/suspended admin cannot resolve even with a still-valid historical token.
- **Tasks:** only currently active permitted role holders may create tasks on cases they can participate in. Suspended assignees must not receive tasks. Only the current creator, assignee or currently active organization administrator may update an existing task.
- **Reminders:** asset-read rights must remain valid through reminder insertion; a revoked grant or suspended user cannot create reminders. Task, dispute and reminder listings must not show confidential records to a stale former admin.
- **Tenant separation:** try all endpoints using organization B's asset/case/task/dispute/quote IDs from organization A. Verify RLS and application authorization on actual PostgreSQL, absence of data leaks, and correct audit atomicity.

## 5. Release policy

Run dependency audit, full build, real PostgreSQL and authenticated HTTP, browser interactions, upload malware scan, payment-price authority, MFA, original Git-history credential scan, recovery/rollback, HTTPS/SSH restrictions and cross-tenant adversarial tests as separate recorded gates. **v0.76 remains NO-GO for production** until those gates pass. Preserve only redacted evidence.
