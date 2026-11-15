# AssetTrust v0.85 — Kali Linux Build and Runtime Acceptance

Use a trusted Kali development machine, a **disposable local** PostgreSQL/PostGIS database and separate non-bypass application role. Do not run these instructions against actual customer data or a production database.

## A. Offline checks (no PostgreSQL and no install)

```bash
cd /path/to/extracted/assettrust-v85
node --version
npm --version
npm run verify:v85
npm run verify:architecture
npm run verify:syntax
npm run build:source:v56
npm run build:imports:v80
npm run build:acceptance:plan:v68
npm run build:acceptance:inspect:v68
```

`--inspect` is expected to return nonzero for a fresh ZIP until a genuine lockfile exists. Do **not** interpret a clean TypeScript transpilation as compilation.

## B. Lockfile generation and supervised real compilation

Preserve and review any original repository lockfile. The distributed archive intentionally has no invented `package-lock.json`. With npm registry access, **only if no lockfile is present**:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
```

The authorized supervisor performs `npm ci`, `npm audit --omit=dev --audit-level=high`, `npm run build`, compiled artifact validation, an earlier and the current regression suite, with protected-source hash checks after every command. Afterward inspect `test-evidence/v68/build-acceptance.json` and its first failure if nonzero; avoid copying its private contents to public issue trackers. The supervisor purges credential environment variables before launching installation/build children.

An operator may also independently execute `npm run build`, but it is not a substitute for the supervised provenance evidence.

## C. Database and functional acceptance

Only on a disposable, nonproduction PostGIS instance with a restricted non-BYPASSRLS runtime role, follow the previously supplied `V70_KALI_VALIDATION.md` and `V83_KALI_VALIDATION.md` plus their verified scripts:

```bash
npm run kali:integration:plan:v70
npm run kali:integration:doctor:v70
npm run kali:acceptance:inspect:v73
npm run kali:disputes:plan:v77
npm run kali:migrations:plan:v78
```

Use the guarded mutation commands **only after verifying their exact target database identity, role and scope**. Test all 27 migrations and ledger idempotence, tenant RLS, MFA/TOTP/password resets and revocations, document confidentiality and ClamAV clean/threat verdicts, disputes/concurrency, financial quotes, administrator permissions, recovery, and actual browser UI. Record exact versions, commands, failures and redacted logs. Never skip a check because it is inconvenient.

## D. Local bind safety

The API and Vite web dev/preview bind `127.0.0.1` by default. For any intentional LAN demo, use firewall/VPN isolation, avoid production databases, set `API_BIND_HOST=0.0.0.0` and `ASSETTRUST_ALLOW_LAN_DEV=YES` **only in development**, and explicitly override the web Vite host. A user-facing development server on the public internet is not approved. Production external accessibility must use reviewed HTTPS reverse proxy rules, not a direct public API listener.

## E. Release decision

Even if compilation succeeds, production status remains **NO-GO** until independent review and live security gates pass: real authentication and MFA, per-tenant DB/query/service authorization, encrypted document storage and safe uploads, full npm dependency audit, whole-Git-history secret scans and key rotation, server-authoritative prices/payments, browser and API negative testing, backup/restore, TLS/deployment and rollback evidence. Never report live tests as passed from this archive alone.
