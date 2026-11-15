# AssetTrust v0.65 — Kali Linux Validation and Acceptance

**Use only a trusted development/staging computer.** Do not overwrite your existing Git clone or use any production credentials, shared database, public database host or real customer records.

## 1. Extract in a separate directory and inspect

```bash
mkdir -p ~/Projects/assettrust-v65
unzip ~/Downloads/AssetTrust_v65_Trustworthy_Readiness_and_Runtime_Diagnostics_Checkpoint.zip -d ~/Projects/assettrust-v65
cd ~/Projects/assettrust-v65/assettrust-v65
node --version
npm --version
npm run verify:v65
npm run verify:architecture
npm run diagnose:inspect:v65
```

The new inspect command makes **no database connections or child-process calls**. It reports whether prerequisites exist, plus source SQL SHA-256 consistency. It does not prove an executable service is working. To preserve a local 0600 diagnostic file:

```bash
npm run diagnose:evidence:v65
# Review output before sharing; it contains only prerequisite flags and issue codes.
cat test-evidence/v65/runtime-diagnostic.json
```

The source ZIP intentionally lacks the original `.git` history and authentic npm lockfile. Do not copy unreviewed material from this ZIP over an existing working clone.

## 2. Install and compile with authentic dependencies

On trusted, connected Kali (with reviewed package manifests):

```bash
# Only when package-lock.json does not already exist:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

The authentic lockfile should be inspected and committed to the trusted repository. If any command fails, preserve the **first failed command and redacted error**; do not add `|| true`, skip a gate or substitute a fabricated lockfile. After successful manual build, the existing supervised command can provide reproducible build-stage evidence:

```bash
npm run integration:build:v64
```

That complete run includes all version/regression tests, API unit tests, static & production build gates, ClamAV integration and original Git-history security scanning; check the v0.64 handover for optional environment prerequisites. If the archive is not a Git clone, perform the history scan in the original trusted clone.

## 3. Prepare and validate a disposable PostgreSQL/PostGIS target

Use the v57–v64 Kali guides to create **only** an `assettrust_test` or `assettrust_ci` loopback test database, separate migration/operator credential and a non-owner/no-BYPASSRLS restricted runtime role. Review migrations and fixture data first. Do not place DB URLs or secrets in command lines shared in chat. Load them privately.

Set only after you have confirmed that this is a disposable loopback database:

```bash
export CI=true NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V51_ALLOW_DATABASE_TESTS=YES
export ASSETTRUST_V51_DB_CONFIRM=assettrust_test
export ASSETTRUST_V51_LOCAL_CONFIRM=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
export ASSETTRUST_V58_SEEDED_RLS_CONFIRM=YES
export ASSETTRUST_V59_CRUD_CONFIRM=YES
export ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM=YES
export ASSETTRUST_V63_POLICY_CONFIRM=YES
export ASSETTRUST_V64_DB_CONFIRM=assettrust_test
# Privately load DATABASE_URL and ASSETTRUST_RUNTIME_DATABASE_URL
npm run integration:database:v64
```

The existing supervised plan also contains suite-specific explicit confirmations. Follow those prior stage instructions rather than relaxing validation. This stage **can mutate test data**. It must never be run against production or a shared company database.

## 4. Verify the corrected dashboard through a running API

Start the app only after its environment, schema, RLS and production security preconditions are met in the dev/staging environment. Test these actions:

1. With the correct 27 checksum-matching migrations, `GET /api/v1/readyz` should return HTTP 200, `version: "0.65.0"` and `migrationsVerified: 27`.
2. Before migrations, after tampering the **disposable fixture ledger only**, or when PostGIS is absent, the app should **refuse to start** or `/readyz` must return non-200; never alter a production migration/ledger for testing.
3. Open **Deployment Readiness** in the live React frontend and verify the API version and dynamic migration count; preview mode must not assert a live ready state.
4. Simulate optional `/integrations/status` failure in staging without breaking `/readyz`. The dashboard must still show database readiness separately and display the integration error. Confirm ordinary user roles do not access organization-admin-only integration data.
5. Repeat against two API instances and the restricted runtime role; include the existing cross-organization and recipient-isolation negative tests, MFA/session/reset and provider-disabled checks.

## 5. Security and release gate

Block release until dependency auditing, ClamAV scanning, original Git-history secret detection/rotation, authenticated HTTP/browser tests, RLS and tenant isolation, safe uploads/storage, admin MFA/RBAC, price/payment enforcement, HTTPS and private SSH exposure, backup restore, rate-limiting, disaster recovery and independent security/legal review all have recorded passing evidence. **A `/readyz` 200 response is necessary for operations but is never sufficient for production approval.**
