# AssetTrust v0.68 — Kali Linux Build and Integration Acceptance

**Use only on a trusted development/staging computer.** Do not run destructive or fixture-based commands against production, shared databases, customer information, or a non-loopback PostgreSQL host. Do not paste `.env` contents, database URLs, signing keys, or real credentials into chats or reports.

## 1. Unpack and inspect the new source

```bash
mkdir -p ~/Projects/assettrust-v68
unzip ~/Downloads/AssetTrust_v68_Build_Acceptance_and_Artifact_Provenance_Checkpoint.zip -d ~/Projects/assettrust-v68
cd ~/Projects/assettrust-v68/assettrust-v68
node --version
npm --version
npm run build:acceptance:plan:v68
npm run verify:v68
npm run build:source:v56
```

Node 22.12+ is required. Compare the extracted source with your **existing original Git clone**, and do not overwrite the clone's `.git` history or a reviewed `package-lock.json`. This ZIP contains no `.git`, no genuine lockfile and no secret `.env`; those cannot be recreated by guessing.

## 2. Install authentic dependencies, then build and collect evidence

On **connected Kali with a trusted npm registry**, only if `package-lock.json` is *missing*, generate it using the existing explicitly guarded tool. If the original Git checkout already has a reviewed lockfile, retain and inspect it rather than generating another.

```bash
# ONLY IF package-lock.json does not already exist:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55

# Review dependency sources, transitive packages, install scripts and lockfile diff.
npm run lockfile:check:v55

# Confirm the non-production build runner will operate only on this checkout:
npm run build:acceptance:inspect:v68

# The runner executes npm ci, audit, API + web build, artifact tests, v68 regression.
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

The last command produces `test-evidence/v68/build-acceptance.json` with filesystem mode `0600`. It records **only the first failed step**, exit code, elapsed time, and a bounded redacted local error excerpt. It does not print raw stderr. It must return nonzero on failure. Fix the root cause and rerun: never use `--force`, `|| true`, a fake dependency lockfile, relaxed SQL policy, or manually generated `dist` files to bypass a blocked gate.

If you need to inspect compiled files separately after a successful build:

```bash
npm run build:acceptance:artifacts:v68
npm run build:artifacts:v56
```

The acceptance result `BUILD_CHECKS_PASSED_RELEASE_STILL_BLOCKED` means the **local build** gate passed, not that API/data security or production deployment passed. A failing `--inspect` is expected on this source ZIP until a reviewed lockfile exists; it is not a reason to lower security.

## 3. After a verified build, run live disposable database acceptance

Provision and use only a fresh loopback `assettrust_test` or `assettrust_ci` PostgreSQL/PostGIS database. Keep the schema operator login distinct from the restricted **non-owner, non-BYPASSRLS** API runtime login. Confirm the **27** pinned SQL migrations, **13** FORCE-RLS tables and **16** approved policies. Follow `V57_KALI_VALIDATION.md` through `V67_KALI_VALIDATION.md` for exact setup and the existing test-by-test safety opt-ins.

Run the audited existing scripts only with all required confirmations and a fully verified disposable target:

```bash
# Do not copy or export real credential values into chat or evidence.
export NODE_ENV=test CI=true
npm run integration:plan:v64
# Then, after all documented explicit disposable DB confirmations are in place:
# npm run integration:database:v64
```

Also test two live API instances, role permissions, cross-organization negative CRUD, recipient-private inbox, full admin controls, real authentication, secure document upload/malware verdicts, user registration and login, evidence verification, the real React deployment-readiness dashboard, and browser flows. Restore the disposable DB after any policy-drift negative test. Run tests on the *built* application, not only source simulations.

## 4. Required final production gate

Before release require real administrator MFA and least-privilege role enforcement, Argon2id/bcrypt credentials, CSRF/cookie/reset protection as applicable, server-side validation, protected document storage, HTTPS and private database access, parameterized queries, full original Git-history secret scanning and rotation, dependency vulnerability audits, malware scanner acceptance, rate limits, multi-tenant isolation tests, backup/restore drills, deployment rollback rehearsal, browser E2E, and independent security review. **No production approval is issued by this milestone.**

If a command fails, share **only** the redacted command name, sanitized error excerpt and evidence status, never actual credentials.
