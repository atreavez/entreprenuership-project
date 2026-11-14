# AssetTrust v0.71 — Kali Linux end-to-end acceptance

**Disposable test data only.** This workflow can install npm dependencies, create a local database role, apply migrations and run tests that write synthetic records. **Never execute on production, shared PostgreSQL, or customer data.** It does not deploy AssetTrust.

## 1. Extract and inspect

```bash
mkdir -p ~/Projects/assettrust-v71
unzip ~/Downloads/AssetTrust_v71_Supervised_Kali_Acceptance_Checkpoint.zip -d ~/Projects/assettrust-v71
cd ~/Projects/assettrust-v71/assettrust-v71
node --version  # >=22.12
npm --version
docker compose version
npm run verify:v71
npm run kali:acceptance:plan:v71
npm run kali:acceptance:inspect:v71
```

Only proceed from a trusted Git checkout / reviewed ZIP. Inspect the Compose file and the original `compose.yaml`. The isolated fixture is **loopback-only** PostGIS at `127.0.0.1:55432` and ClamAV at `127.0.0.1:13310`, using the local Unix Docker socket. Do not expose the database or ClamAV service publicly.

## 2. Resolve the authentic dependency lockfile

The ZIP deliberately has no invented `package-lock.json`. Prefer the genuine reviewed lockfile in your **original Git repository**. If absent, and only on your connected trusted Kali, generate it once:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run build:acceptance:inspect:v68
```

Review the resulting lockfile and upstream packages before proceeding. Never overwrite a reviewed lockfile or use `npm install --force` to bypass real failures. The supervised acceptance runner will perform `npm ci`, a production dependency audit, compilation, artifact checks and a test gate.

## 3. Prepare private disposable test credentials

**Before generating any secrets**, check whether a previous `assettrust-v70-disposable` Docker project or its named PostGIS volume exists. If it does, **do not generate new passwords for that existing volume**. Verify the original private v0.70 configuration and use the original trusted checkout, or provision a properly isolated new disposable project with reviewed volume names. Do not prune or delete existing data just to pass tests.

If there is **no existing v0.70 disposable database/volume**, on a fresh checkout:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:inspect:v71
```

Credentials are generated inside `.assettrust-local/v70` (0600 files, 0700 directories), ignored by Git. **Never paste or upload these files.** They are only for a disposable test environment.

## 4. Run the one-command end-to-end supervised acceptance

```bash
NODE_ENV=test \
ASSETTRUST_V70_LOCAL_CONFIRM=YES \
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
npm run kali:acceptance:run:v71
```

The supervisor performs the build gate first, then PostGIS, ClamAV, migrations, restricted runtime role, policy/privilege audit and authenticated HTTP integration in order. It refuses production mode and stops at the **first failed step**. It will **not** bypass an npm audit, missing dependency, failed build, failed RLS test, failed infection self-test, MFA denial or failed authenticated workflow.

Inspect the most recent structured report locally:

```bash
ls -lt .assettrust-local/v70/evidence/
# Replace the filename below with one produced above; do not paste private configurations.
python3 -m json.tool .assettrust-local/v70/evidence/v71-<timestamp>-<random>.json
```

The report contains only stage IDs and safe exit/error codes, **not raw stdout, environment variables or secrets**. Preserve the first failing stage and its bounded code when seeking remediation; rerun only after correcting the failure. The v0.68 nested build evidence is in `test-evidence/v68/build-acceptance.json` (owner-only). Review any additional raw local logs privately; never publish credentials or unredacted debug logs.

## 5. Release security is a separate gate

Even when all seven stages pass, the report says **`ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED`**. Before a real deployment, separately require an original-Git-history secret scan, security dependency remediation, verified nonowner RLS across real CRUD, adversarial cross-tenant tests, restricted uploads and malware scanner, real browser tests for all administrator and member roles, admin MFA, HTTPS/reverse proxy and SSH restrictions, safe password resets, backups and actual restore, rate limits, CSRF/cookies, deployment rollback, and independent documented security signoff. Critical findings block release.

**Do not run `docker compose down -v`, `docker volume prune`, or any production migration just to make the test pass.**
