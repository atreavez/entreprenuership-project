# AssetTrust v0.70 — Kali Linux Integration Runbook

**Only for a NEW, disposable local test database. Never run on production or on a shared database.** Do not overwrite your existing Git checkout or `.env`; retain the original Git history for mandatory secret scanning and use this ZIP as an upgrade candidate only after review.

## 1. Inspect source (safe, no database changes)

```bash
mkdir -p ~/Projects/assettrust-v70
unzip ~/Downloads/AssetTrust_v70_Disposable_Kali_Integration_Checkpoint.zip -d ~/Projects/assettrust-v70
cd ~/Projects/assettrust-v70/assettrust-v70
node --version                  # Node >=22.12
npm --version
npm run verify:v70
npm run kali:integration:plan:v70
```

Verify that `compose.integration-v70.yaml` exposes **only loopback ports 55432 (PostGIS) and 13310 (optional ClamAV)**. The v0.70 helper uses `/var/run/docker.sock` on the same Kali computer, not a remote Docker context. Confirm Docker Compose v2 works before continuing (`docker compose version`). Never replace or delete an existing development database/volume while preparing the isolated fixture.

## 2. Generate private test secrets and start isolated services

```bash
# This mode creates .assettrust-local/v70 exactly once. Do not run it to rotate existing keys.
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70

# Start PostGIS only after checking the Compose file and confirming this is a new disposable test volume.
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:start:v70

# Start local ClamAV for the malware upload and HTTP acceptance gates.
# ClamAV may need to download signature databases on its first startup.
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:scanner:v70

npm run kali:integration:doctor:v70
```

Generated credentials are in `.assettrust-local/v70/`, are **not printed**, and are ignored by Git. The PostGIS container gets the database password from a `0600` secret file; the operator connection and other test-only keys are private and injected by the helper into subprocesses. The helper intentionally does **not** update the original `compose.yaml` or `.env`.

If a Compose port or volume conflicts with an older instance, stop and inspect the **existing** Docker resources. Do not use `docker compose down -v`, `docker volume prune`, or delete a database until you have verified the exact disposable project and checked that no needed data remains.

## 3. Get authentic dependencies and compile

The ZIP does not contain a fabricated lockfile. On a trusted connected Kali install Node dependencies only after verifying the correct project and reviewing the lockfile source. When a reviewed `package-lock.json` already exists in your original repository, carry it forward instead of recreating it.

```bash
# Run this next line ONLY if package-lock.json is absent:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55

npm run lockfile:check:v55
npm run build:acceptance:inspect:v68
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

The supervised build performs real `npm ci`, audit, API/web compilation and artifact checks. If it fails, review the **redacted first failing step** in `test-evidence/v68/build-acceptance.json`. Fix real build errors; do not force past audits, fake `dist/` files or introduce a hand-written `package-lock.json`. Do not pass production database variables or credentials to npm lifecycle scripts.

## 4. Apply the 27 reviewed migrations and provision a restricted runtime login

```bash
# This uses only the private 127.0.0.1:55432/assettrust_test operator URL.
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:migrate:v70

# Creates a separate non-bypass database login and securely records the private runtime URL.
# This cannot overwrite an existing runtime role.
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:provision:v70

# Performs ClamAV's benign/EICAR test, checks the migration ledger,
# and verifies role and exact RLS policy integrity using live PostgreSQL.
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:verify:v70
```

No credentials need to be pasted into the shell: the helper loads and validates its private local files and sets the test process environment itself. `--verify` deliberately fails if ClamAV signatures are not ready or a database policy/role check fails. In that case, investigate and rerun instead of bypassing the failing check.

## 5. Execute the live authenticated HTTP acceptance journey

```bash
# Only after Step 3's genuine build and Step 4's restricted-role verification pass:
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:http:v70
```

The supervisor starts an **owned**, loopback-only compiled API and runs the real v0.69 authenticated administrator/reviewer acceptance followed by four earlier real HTTP/PostgreSQL suites. It checks instance identity before mutation, uses the restricted runtime DB login, and maintains rate limits with pauses between suites. Expect a saved v0.69 report `AUTHENTICATED_ACCEPTANCE_PASSED_RELEASE_BLOCKED` when that suite actually succeeds. Never run these commands against customer records.

## 6. Review final evidence before any release decision

Run the full existing release gate (`npm run release:full:v51`) only after meeting all its explicit disposable-data opt-ins and other dependencies; it remains separate from this helper. Also perform **genuine browsers/UI tests**, MFA step-up, two-organization security attacks, backup/restore tests, TLS/reverse-proxy reviews, upload-scanner validation, and original Git-history credential scanning with rotation of any exposed keys. Preserve redacted logs and failures. A passing local integration suite is necessary but insufficient for production approval.

**Known current checkpoint blockers:** no genuine lockfile/dependencies within this ZIP, no full compilation, no live PostgreSQL or ClamAV in the offline authoring environment, and no original Git history or independent deployment evidence. Production: **NO-GO**.
