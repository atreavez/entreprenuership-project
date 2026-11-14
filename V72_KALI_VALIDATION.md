# AssetTrust v0.72 — Safe Kali Build and Integration Runbook

**Development/test only. Do not run synthetic write tests on production/shared databases.** Use a trusted Kali checkout. Never paste private `.env`, generated passwords or DB URLs into a chat or a public issue.

## 1. Inspect the source

```bash
mkdir -p ~/Projects/assettrust-v72
unzip ~/Downloads/AssetTrust_v72_Runtime_Recovery_and_Build_Compatibility_Checkpoint.zip -d ~/Projects/assettrust-v72
cd ~/Projects/assettrust-v72/assettrust-v72
node --version  # Node >=22.12
npm --version
npm run verify:v72
npm run runtime:db:inspect:v72
npm run kali:acceptance:plan:v72
npm run kali:acceptance:inspect:v72
```

If the archive is extracted directly into your target instead of a nested `assettrust-v72` directory, enter the folder containing `package.json`. Inspect source changes before trusting any commands.

## 2. Resolve missing genuine npm lockfile (connected Kali only)

Prefer the `package-lock.json` from the original trusted Git repository. **Only if it is absent**, generate it once, review dependency resolutions and registry URLs, then commit the reviewed result to Git:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
```

Do not overwrite an existing lockfile, fabricate package hashes or use `npm install --force` to suppress dependency conflicts. The supervised v0.68 build stage will execute `npm ci`, production dependency audit, API/web compilation, artifact safety inspection, historical v68 suite **and the v72 suite**. Any failed step blocks acceptance.

## 3. Prepare independent disposable PostGIS + ClamAV (only if no v70 fixture exists)

First inspect Docker volumes, prior `.assettrust-local/v70/` configurations and existing projects. **Do not rotate credentials for an already-created named volume and never remove a volume containing data to make a test pass.** The supplied Compose file binds PostGIS and ClamAV exclusively to 127.0.0.1 and uses the local Docker socket.

For a genuinely fresh disposable fixture only:

```bash
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:inspect:v72
```

Private configuration is created in `.assettrust-local/v70/` with owner-only permissions. Keep these files out of Git and shared uploads.

## 4. Execute the supervised build and local integration test

```bash
NODE_ENV=test \
ASSETTRUST_V70_LOCAL_CONFIRM=YES \
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES \
npm run kali:acceptance:run:v72
```

The supervisor stops at the first failure and writes an owner-only JSON report under `.assettrust-local/v70/evidence/v71-*.json`. Although named `v71` for backward compatibility, its `version` field must be `0.72.0`. Read the report locally; share only a redacted stage ID, bounded exit code and sanitized error description. Child output/credentials are not retained by the supervisor report.

The seven high-level acceptance phases are genuine npm build, PostGIS startup, ClamAV startup, 27 migrations/ledger check, restricted runtime-role provisioning, live policy/scanner checks, and authenticated HTTP tests. The build phase now requires the v72 regression step as well as the historical v68 step.

## 5. Interpret results safely

A source check passing does not demonstrate real PostgreSQL behavior. A passing local integration run means test commands completed, **not** that the production release gate passed. The online API Pool now enforces 15s statement, 20s query, 3s lock, 30s idle-transaction and 5s connection deadlines; verify with the actual installed node-postgres driver in disposable staging, and assess report-query performance against the limits before any deployment.

Separate release blockers include original Git-history secret scan and rotation, security dependency audit, live cross-tenant CRUD and RLS negatives, real admin MFA/browser workflows, document malware scanning, HTTPS/private SSH, abuse resistance, backup **and restore** tests, deployment rollback and independent security signoff. **NO-GO until critical issues are resolved.**
