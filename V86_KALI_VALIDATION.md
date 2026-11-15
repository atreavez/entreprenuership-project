# AssetTrust v0.86 — Kali Validation and Build-to-Live Acceptance

**Only use a trusted workstation and a disposable local database. Never connect production data to the acceptance tools.** This archive intentionally has no `node_modules` and no fabricated npm lockfile.

## A. Read-only offline preflight

```bash
cd /path/to/assettrust-v86
node --version
npm --version
npm run verify:v86
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run acceptance:provenance:plan:v86
npm run build:acceptance:inspect:v68
npm run acceptance:provenance:inspect:v86
```

For a fresh ZIP the last two inspection commands **should fail** before an authentic lockfile, real compile and supervised evidence exist. Do not change the code to force them to succeed.

## B. Genuine connected dependency installation and compilation

If you have an original reviewed repository lockfile, keep it. If the extracted project truly has no lockfile, generate and review one using the provided project guard:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm run security:scan:v43
npm run build:acceptance:inspect:v68
ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
npm run acceptance:provenance:inspect:v86
```

The supervised run executes the authentic `npm ci`, high/critical production dependency audit, full NestJS and React compilation, generated-artifact policy, v0.68 and v0.86 regression, verifies the reviewed source after every step and records **all** API and web build output hashes. Failure aborts the acceptance chain. If the build fails, capture compiler error descriptions **without copying secrets** and correct only real errors. Do not treat the documentation or offline tests as build evidence.

## C. Prove tamper detection

On a disposable extracted copy only, after a successful build, change any compiled `apps/web/dist/assets/*.js` or `apps/api/dist/**/*.js` or any reviewed API/web source. The read-only `npm run acceptance:provenance:inspect:v86` must then fail with an output or source mismatch. Re-extract/rebuild to return to a clean state; **do not** hand-edit JSON hashes to make it pass.

## D. Local live PostgreSQL and application acceptance

Once provenance is verified, inspect the pre-existing strict isolation planners:

```bash
npm run kali:integration:plan:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:plan:v73
npm run kali:disputes:plan:v77
npm run kali:migrations:plan:v78
```

Follow the pre-existing v70/v73 setup guide to create a disposable local PostGIS database, local ClamAV, and a **restricted non-superuser, non-BYPASSRLS** application login. Confirm targets and roles **before** applying any mutating acceptance commands. Run all 27 SQL migrations, MFA login/logout and TOTP enrollment, tenant RLS isolation, document encryption/virus scan, multi-case dispute races, pricing/payment integrity and end-to-end administrative and browser workflows. Record real test results and evidence. Do not substitute mocked tests for live DB concurrency.

## E. Hard production gate

Production remains **NO-GO** until authentic compilation, live DB/HTTP/browser/adversarial evidence, package vulnerability review, full original Git-history secret scanning and rotation, real RBAC/MFA, server-side pricing/payment verification, safe upload malware screening, TLS/SSH hardening, backup/restore and rollout/rollback rehearsals all succeed. A matching build-source digest is not a signed release provenance statement.
