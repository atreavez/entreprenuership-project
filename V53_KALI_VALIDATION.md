# AssetTrust v0.53 — Kali Linux live validation handover

**Production release: NO-GO until every live gate passes.** Do not use an actual customer, production or shared database for this procedure. Do not run on a server already hosting user traffic.

## 1. Preserve your current deployment and get the real repository

Back up the database, encrypted document store, encryption keys and signing keys securely; **test restoring the backup to an isolated database**. Use your actual Git clone when you need a full-history secret scan: a downloaded source ZIP does not contain `.git` history. Never overwrite an applied migration or point the test runner at the real customer database.

For a standalone code review (not full history), extract the new ZIP:

```bash
unzip AssetTrust_v53_CI_Integrity_and_Live_Evidence_Checkpoint.zip
cd assettrust-v53
```

Check prerequisites: Node.js 22.12+, npm, Ruby with Psych, PostgreSQL with PostGIS, and a running ClamAV daemon with current signatures. The `Ruby` checker is a fail-closed prerelease dependency.

## 2. Review the repaired CI workflow first

```bash
ruby tools/workflow-policy-v53.rb
npm run verify:ci:v53
npm run verify:v53
npm run release:plan:v51
```

The plan should include `two-real-api-instances` and `supervised-http-integrations` in addition to the 24 PostgreSQL contracts. The workflow now parses as YAML. **This does not prove that it ran on GitHub.**

## 3. Generate and review an authentic npm lockfile

On a trusted, network-connected development machine, with the repository in a reviewed state:

```bash
npm install --package-lock-only --ignore-scripts
npm run supply-chain:v51
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

Inspect the generated `package-lock.json` and any installation-script packages. Fix vulnerability alerts; do not use `npm audit fix --force` as a substitute for regression review. Commit the genuine reviewed lockfile so CI can use `npm ci`. Do not invent or copy one from an unrelated project.

## 4. Set up the actual local antivirus

On Kali, review the packaged ClamAV services and install the daemon and signature updater using trusted OS packages. A typical setup is:

```bash
sudo apt update
sudo apt install clamav clamav-daemon clamav-freshclam
sudo systemctl enable --now clamav-freshclam clamav-daemon
sudo systemctl status clamav-daemon --no-pager
```

Use the actual socket path from `clamd.conf`, for example:

```bash
unset CLAMAV_TCP_PORT
export CLAMAV_SOCKET_PATH=/run/clamav/clamd.ctl
npm run security:clamav:v52
```

The live test must accept benign bytes and reject the harmless EICAR antivirus test signature. Resolve socket permission/signature-update problems rather than disabling scanning. Never expose the scanner to the public internet.

## 5. Set up a strictly disposable PostgreSQL test database

Create a **new** loopback-only PostGIS database named `assettrust_ci` or `assettrust_test`. Put credentials in a private secret manager or trusted local environment file, never in frontend JavaScript, screenshots or Git. For example, set `DATABASE_URL` via private secret injection to a `postgresql://...@127.0.0.1:5432/assettrust_ci` URL. Confirm no customer data is present. The runner deliberately rejects remote hosts, unsafe names and PostgreSQL connection-string overrides.

Only after confirming that the target is disposable:

```bash
export NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V51_ALLOW_DATABASE_TESTS=YES
export ASSETTRUST_V51_DB_CONFIRM=assettrust_ci
export ASSETTRUST_V51_LOCAL_CONFIRM=YES
export ASSETTRUST_E2E_URL=http://127.0.0.1:4000
# Provide DATABASE_URL, JWT_SECRET, MFA_ENCRYPTION_KEY, DOCUMENT_ENCRYPTION_KEYS,
# DOCUMENT_ACTIVE_KEY_ID and any other required test values via your private secret manager.
npm run release:full:v51
npm run evidence:review:v53
```

The runner generates distinct per-run ownership markers and executes **88 stages** (based on the v0.53 package manifest), including safe migrations, 24 PostgreSQL contract suites, two independent API processes, and the supervised HTTP integration suites. It stops on the first failure and writes a private, redacted result to `test-evidence/v51/local-validation-summary.json`. Do not modify the report to claim success. If a new script is added later, the expected count increases automatically.

If you cannot run the full supervised plan at once, run `npm run release:validate:v51` (build-only) and `npm run release:database:v51` (database-only) separately. **The v0.53 completeness checker will not accept those as a full run.**

## 6. Independent release checks still needed

A complete supervised result alone does **not** approve production. You still need HTTPS/HSTS and firewall/SSH exposure tests, least-privileged non-bypass DB roles, two-tenant cross-access testing, real upload EICAR rejection in the deployed server, authenticated browser/administrator/MFA journeys, document/keys backup-and-restore drill, dependency review, full Git-history secrets scan and rotation of any leaked keys, external penetration testing and required legal/privacy review. Preserve evidence and use the mandatory cross-project final security release gate.
