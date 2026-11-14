# AssetTrust v0.56 — Kali Linux build and security validation

**Only use a trusted development machine. Never use production data for mutating tests.**

## 1. Extract separately and check source

```bash
mkdir -p "$HOME/Projects/assettrust-v56-validation"
cd "$HOME/Projects/assettrust-v56-validation"
unzip "$HOME/Downloads/AssetTrust_v56_Vite_Entry_and_Artifact_Security_Checkpoint.zip"
cd assettrust-v56
node --version
npm run verify:v56
npm run build:source:v56
npm run verify:ci:v53
```

The source checker must pass **before** dependency installation; it verifies `apps/web/index.html` and relative source imports.

## 2. Generate and review an authentic npm dependency graph

```bash
npm run lockfile:check:v55  # expected to reject an absent lockfile
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run supply-chain:v51
sha256sum package-lock.json
```

This requires an actual trustworthy npm registry connection; do not synthesize or copy a lockfile from an unrelated project. Review the file and installation scripts. Keep the lockfile in the canonical Git repository once approved.

## 3. Compile and verify real outputs

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
npm run build:artifacts:v56
npm run verify:architecture
npm run verify:syntax
```

The full build must generate `apps/api/dist/main.js`, `apps/web/dist/index.html`, and Vite-generated `apps/web/dist/assets/*.js`. The new gate inspects those files. Share **sanitized errors** from the first failing command to enable a targeted fix; do not share secrets or `.env` contents.

## 4. Real security and database proof

Preserve the original complete Git clone for `npm run security:scan:v54 -- --repo <original-repo-path>`. Confirm ClamAV with `npm run security:clamav:v52`. Use a localhost disposable database named `assettrust_ci` or `assettrust_test`, dedicated test-only credentials, and the explicit safety approvals documented in `V55_KALI_VALIDATION.md`. Run `npm run release:full:v51` only after that preflight and with a verified backup and restore plan.

Also perform authenticated two-tenant/browser access tests, real HTTPS and firewall checks, backups/restore, current dependency-vulnerability remediation and independent security review. **None is proven by the local source checker.**

## 5. Decision

**NO-GO** until all mandatory production gates are evidenced. Do not process real land-title evidence or payments on this checkpoint.
