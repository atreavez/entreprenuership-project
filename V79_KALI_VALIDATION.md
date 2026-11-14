# AssetTrust v0.79 — Kali build and runtime validation

Work only on a trusted development host. First extract the ZIP and enter `assettrust-v79`. Do not point the integration tooling at a production system or real customer data.

## 1. Source checks (read-only)

```bash
node --version
npm --version
npm run verify:v79
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v53
node tools/build-artifact-gate-v56.cjs --source
npm run lockfile:check:v55
```

## 2. Authenticated dependency resolution and compile

If `package-lock.json` is already present, review it and **do not** regenerate it. Otherwise, only on connected Kali, explicitly authorize npm to resolve the real graph:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

If build fails, retain the *first* compiler error and fix code/dependency/peer issues before proceeding. Never bypass the lockfile audit or generate fake digests. `NODE_ENV=production` must not be set when generating the lockfile. Keep secrets out of terminal logs and screenshots.

Optional supervised build evidence after lockfile review:

```bash
NODE_ENV=test ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

The build evidence file is local/private and does **not** certify the database, HTTP flows or production security.

## 3. Disposable live integration (after successful build)

```bash
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v71
npm run kali:migrations:plan:v78
npm run kali:disputes:plan:v77
```

Follow `V70_KALI_VALIDATION.md`, `V71_KALI_VALIDATION.md`, `V73_KALI_VALIDATION.md`, `V77_KALI_VALIDATION.md`, and `V78_KALI_VALIDATION.md` to configure loopback-only disposable PostGIS and ClamAV, private runtime credentials, checked migrations and restricted non-owner roles. Only run the destructive synthetic test commands with their documented confirmation flags. Verify real administrator demotion/suspension against `/api/v1/dashboard`, `/api/v1/audit`, `/api/v1/integrations/status` and case report routes using the authenticated HTTP test environment. Verify case evidence is denied after reassignment.

## 4. Final release decision

Run source and **Git-history** secret scans, regression, dependency vulnerability, real DB RLS, authenticated HTTP, browser, load, backup/restore, security and adversarial checks. Any unverified critical check means **NO-GO**. The v0.79 checkpoint is a tested source artifact only.
