# AssetTrust v0.80 — Kali Compilation and Integration Validation

**Use only a trusted local development machine, not the production server or a database containing customer records.** The commands below are intended for the new, clean `assettrust-v80` project directory extracted from the ZIP.

## A. Verify source and manifest completeness (safe; no database changes)

```bash
node --version                  # Node.js >= 22.12
npm --version
npm run build:imports:v80
npm run verify:v80
npm run build:source:v56
npm run verify:architecture
npm run verify:syntax
npm run verify:ci:v53
npm run lockfile:check:v55
```

The last command is **expected to fail** on an unmodified source ZIP because no authentic `package-lock.json` is bundled. Do not fabricate it or copy a lockfile from a different version.

## B. Resolve the actual npm dependency graph (requires trusted internet access)

```bash
# ONLY if package-lock.json is absent. The guarded tool does not overwrite existing locks.
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
```

Review the resolved `express` version and `@nestjs/platform-express` compatibility, any new install scripts/native modules, the exact lockfile diff, and npm audit findings. Keep the reviewed lockfile with the same source commit. If existing lockfile is present, stop and reconcile its graph rather than overwriting it.

## C. Actually compile both applications

```bash
npm run build
npm run build:artifacts:v56
npm run build:acceptance:artifacts:v68
```

The genuine TypeScript compiler and Vite output—not offline transpilation alone—must pass. If the compile fails, save the first compiler error and the last ~80 nonsecret lines of output, then fix its root cause and repeat. **Do not paper over errors by adding ambient `any` declarations or disabling compiler checks.** Do not include `.env`, passwords, tokens or other secrets in shared logs.

## D. Run the guarded local PostGIS/authenticated acceptance gates

```bash
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v71
npm run test:e2e:documents:plan:v73
npm run kali:disputes:plan:v77
npm run kali:migrations:plan:v78
```

Follow `V70_KALI_VALIDATION.md`, `V71_KALI_VALIDATION.md`, `V73_KALI_VALIDATION.md`, `V77_KALI_VALIDATION.md`, and `V78_KALI_VALIDATION.md`. Only use disposable loopback-bound PostGIS and ClamAV with their required explicit confirmation flags. Verify migrations, FORCE-RLS policies, restricted non-owner PostgreSQL login, MFA, two-organization isolation, document revocation, disputes, dashboards, quote/admin permissions, and representative web UI behavior.

## E. Final security gate and deployment

Scan the **actual complete Git history** in your own checked-out repository, perform independent dependency and adversarial reviews, exercise backups and restores, validate secure admin MFA, HTTPS, limited SSH exposure, secret rotation, injection and tenant isolation. **Do not approve a production deployment** from the v0.80 archive alone. The current release decision is **NO-GO** until all critical gates pass with real evidence.
