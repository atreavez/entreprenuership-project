# AssetTrust v0.73 — Kali Linux Build & Document Revocation Acceptance

**Use a disposable, locally owned development database only.** Do not execute synthetic data writes on production, shared PostgreSQL or customer documents. Never paste `.env`, database URLs, JWT keys, invite tokens or other credentials into chats or logs.

## 1. Extract in a new location

```bash
mkdir -p ~/Projects/assettrust-v73-checkpoint
unzip ~/Downloads/AssetTrust_v73_Transactional_Document_Read_and_Revocation_Checkpoint.zip -d ~/Projects/assettrust-v73-checkpoint
cd ~/Projects/assettrust-v73-checkpoint/assettrust-v73
node --version
npm --version
npm run verify:v73
npm run test:e2e:documents:plan:v73
npm run kali:acceptance:plan:v73
```

Do not overwrite an existing working checkout or credentials. Verify you entered the directory containing `package.json`. Node >=22.12 is required by this project.

## 2. Genuine lockfile and build (connected Kali)

The source ZIP intentionally does not contain `package-lock.json`. **Prefer the authentic reviewed lockfile from your trusted Git clone.** Only if none exists, the existing v55 process may generate one using the configured registry:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run build:acceptance:plan:v68
```

Review resolved dependencies and install scripts before continuing; do not overwrite a reviewed lockfile or ignore audit failures. Run the supervised build on an appropriately isolated host with explicit authorization:

```bash
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

Review the **owner-only** build evidence `test-evidence/v68/build-acceptance.json`. It must report a seven-stage success with the final `current-milestone-regression` executing `verify:v73`. A failed build blocks all subsequent live acceptance steps.

## 3. Reuse the approved v70 disposable fixtures

Inspect existing Docker volumes and `.assettrust-local/v70/`. Do not rotate secrets for an existing named volume. For an entirely fresh local fixture, and *only after reviewing* `compose.integration-v70.yaml`:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:inspect:v73
```

The v70 supervisor uses local Docker Unix socket, loopback-bound PostGIS and ClamAV ports, a separate non-owner runtime database role, and `assettrust_test` database. Follow earlier v70 instructions for local setup errors. Do not change the Compose password for an existing volume.

## 4. Run the supervised end-to-end acceptance

Only after build acceptance, vetted migrations, scanner readiness and restricted role prerequisites are satisfied:

```bash
NODE_ENV=test \
ASSETTRUST_V70_LOCAL_CONFIRM=YES \
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
npm run kali:acceptance:run:v73
```

The supervised runner starts the real local API and runs six HTTP suites. v73's new suite runs with a separate `ASSETTRUST_V73_DOCUMENT_CONFIRM=YES` passed internally only for that synthetic test. Do not execute the v73 live test manually against a preexisting server without supervising and verifying the owner marker.

The v73 suite creates only synthetic users and an in-memory test PDF, then tests current-role access, cross-organization denial, authorized read grant, revocation and post-revocation denial. The synthetic records remain inside the disposable database until the test fixture is safely retired. Its minimal private evidence is stored as a 0600 file under `test-evidence/v73/`.

## 5. Result interpretation

- A passing offline `verify:v73` is **not** a real PostgreSQL lock or malware-scan test.
- A failed build or one failed database/HTTP suite is **NO-GO**. Preserve only redacted stage IDs, exit codes and error classes for remediation.
- A passing local test is **still not** a production release approval. Verify TLS, public network exposure, the actual target PostgreSQL major version, backup and restore, concurrency under load, real browser flows, adversarial tenant isolation, independent security review, and original Git-history credential scan before release.
- Never delete or reinitialize a Docker volume just to force a green test.
