# AssetTrust v0.64 — Kali Linux live integration instructions

**All steps are development/staging only, never production.** Use a fresh disposable local PostgreSQL/PostGIS database, separate migration/operator vs. restricted runtime roles, and synthetic or scrubbed fixtures. Do not send database URLs, tokens or real client records into chat.

## A. Open and inspect the archive

```bash
mkdir -p ~/Projects/assettrust-v64
unzip ~/Downloads/AssetTrust_v64_Runtime_Integration_Evidence_Checkpoint.zip -d ~/Projects/assettrust-v64
cd ~/Projects/assettrust-v64/assettrust-v64
node --version
npm --version
npm run verify:v64
npm run verify:v63
npm run integration:plan:v64
npm run integration:inspect:v64
```

**Important:** The package ZIP does not contain the original `.git` repository; use the trusted Git checkout when running a history audit. Compare/merge vetted source changes; do not blindly copy an archive over a working repository or expose secrets from `.env`. Node 22.12+ is required.

## B. On a trusted networked Kali machine, bootstrap genuine dependency resolution

```bash
# Only if package-lock.json is absent and reviewed manifests are correct:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run integration:build:v64
```

The `--build` operation executes the supervised v0.51 validation plan including clean `npm ci`, `npm audit --omit=dev --audit-level=high`, version and architecture checks, API tests, real API/React compilation, build artifact checks, ClamAV and original Git-history scanning. It stops on the first error and records a summary; do not bypass failures. Commit the authentic lockfile only after review. If the lockfile already exists, verify it instead of regenerating it.

## C. Prepare the disposable PostgreSQL integration target

Apply **reviewed** migrations and provision the restricted role following `V57_KALI_VALIDATION.md` through `V63_KALI_VALIDATION.md`; ensure both `apps/api/dist/main.js` and `apps/web/dist/index.html` were truly built. The operator should be able to apply fixtures but the runtime role **must not** own tables or bypass row-level security. Do not paste credentials into shell history: use a private environment file or another appropriate secrets mechanism.

These environmental confirmations are **deliberately required** for `--database`:

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

# DATABASE_URL = operator login to postgres on 127.0.0.1/assettrust_test
# ASSETTRUST_RUNTIME_DATABASE_URL = separate restricted runtime login to THE SAME target
# Load them privately; do NOT paste the actual values into reports or chat.

npm run integration:inspect:v64
npm run integration:database:v64
```

The v51 database runner may update or create test fixtures; the database must contain **no real records**. For a fresh environment use `assettrust_ci` in all confirmation variables if that is the actual name. The contract rejects remote targets, mismatched URLs, owner/bypass roles, absent confirmations and unbuilt applications. The database runner may require other pre-existing suite-specific authorizations documented in the earlier v21-v63 guides; never weaken those checks just to produce a green run.

## D. Collect evidence and diagnose the first actual failure

```bash
cat test-evidence/v64/integration-summary.json
cat test-evidence/v51/local-validation-summary.json
npm run integration:inspect:v64
```

Only share a *manually reviewed and redacted* summary or terminal error. The runner never treats a pass as a production release decision. If it is blocked on the lockfile, do step B first; if a build fails, fix that concrete error; if database authorization fails, verify the disposable test target and roles instead of overriding safeguards. After fixes, re-run and preserve evidence.

## E. Final release gate (still required)

Before any public deployment: real login/reset/MFA and abuse checks; tenant/admin isolation; safe document storage, upload malware scanning; pricing/payment authority and ledger reconciliation; SQL and secret scans including full Git history; production HTTP security, CSRF/cookies/CORS, private SSH, backup restore, provider failures, adversarial E2E, approvals/report integrity, legal ownership disclaimers and independent review. **NO-GO until all critical/high issues are addressed and evidenced.**
