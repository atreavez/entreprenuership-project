# AssetTrust v0.42 — Kali Linux upgrade and disposable validation

**Do not point any of these commands at a live or customer database.** The v0.42 dual-API contract is a security smoke test; it does not make AssetTrust production-ready.

## 1. Obtain the exact source checkpoint

```bash
cd ~/Downloads
sha256sum -c AssetTrust_v42_SHA256SUMS.txt
unzip -q AssetTrust_v42_Dual_API_Integration_Checkpoint.zip
cd assettrust-v42
node --version
npm --version
```

Use Node >=22.12, npm >=10, Docker/PostGIS or a locally installed disposable PostgreSQL instance. Do not replace your existing installation/database before making a tested backup; old v0.22 data needs a fully reviewed migration path, **not** an unconditional baseline.

## 2. Genuine dependency lockfile — currently BLOCKED in this checkpoint

The source archive deliberately does **not** invent `package-lock.json`. On a trusted connected machine:

```bash
npm install --package-lock-only
# Review package-lock.json, dependency versions and security advisories.
# Commit the reviewed lockfile to source control.
npm ci
npm run verify:ci:v41
npm run verify:v42
npm test
npm run build
```

If dependency resolution, `npm test`, compilation or lockfile review fails, record the logs and stop; do not substitute `--force`, `--legacy-peer-deps`, a stub lockfile or `|| true` merely to make a build green.

## 3. Prepare disposable infrastructure only

Provision a **new empty local** PostgreSQL/PostGIS database named `assettrust_ci` (or `assettrust_test`) and a separate throwaway configuration. Set `DATABASE_URL` to the local test database, not the old real installation. Use truly random, different test secrets. Consult `.env.example` and `tools/ci-security-preflight.cjs` for required variable names; do not commit any `.env` file.

Example setup for the **current shell only** after PostgreSQL and dependencies are ready:

```bash
export CI=true NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V41_CONCURRENCY_CONTRACT=YES
export ASSETTRUST_V42_TWO_API_CONTRACT=YES
export ASSETTRUST_E2E_URL=http://127.0.0.1:4000
marker="assettrust-disposable-$(openssl rand -hex 24)"
export ASSETTRUST_E2E_TARGET_ID="$marker"
export ASSETTRUST_E2E_EXPECT_TARGET="$marker"
# Set DATABASE_URL, JWT_SECRET, MFA_ENCRYPTION_KEY, DOCUMENT_ENCRYPTION_KEYS,
# DOCUMENT_ACTIVE_KEY_ID, WEB_ORIGIN and any other runtime-required test settings.
# Never paste secrets into a shared log/chat.
```

## 4. Single guarded test command

To retain a transcript while preserving a failing exit status, run:

```bash
set -o pipefail
npm run run:disposable:v42 2>&1 | tee assettrust-v42-local-validation.log
```

The script first checks the local disposable database target and explicit authorization. It then requires an authentic lockfile, runs `npm ci`, all 40 version suites, architecture/syntax/unit/build tests, applies and checks migrations, executes the v0.41 two-connection contract and finally runs v0.42's **two real API process** smoke. It does not create or seed real users; no report or title ownership is certified.

Do not upload the complete validation log without reviewing it for environment-specific sensitive data. The two-API runner itself emits no tokens or database credentials in its PASS summary.

## 5. Individual commands to diagnose failures

```bash
npm run verify:v42
npm run verify:architecture
npm run verify:syntax
npm run build
npm run db:migrate
npm run db:check
npm run test:pg:shared-counter:v41
npm run test:e2e:two-api:v42
```

Two APIs default to loopback ports 4101 and 4102; override with distinct port numbers by setting `ASSETTRUST_V42_API_PORT_A` and `ASSETTRUST_V42_API_PORT_B` if needed. If a port is occupied, the per-process identity check must refuse to run against that unrelated service.

## 6. Mandatory next live evidence

After the guarded smoke passes, use an independently provisioned disposable organization and two different MFA-enabled administrators to verify report issuance, PDF signing and report-sharing lifecycle. Run deliberate cross-node tests using a **valid test share** to prove blocked access after repeated failed credentials and correct single-use redemption. Complete browser E2E, ingress protections, key custody, restore drill and legal/privacy review. None of these is replaced by v0.42's negative unknown-share probe.
