# AssetTrust v0.17 — Reproducible build & clean-architecture validation

**Compiled by Aturinzire Hargreave**

## Development baseline
React frontend; NestJS API; PostgreSQL/PostGIS; private encrypted vault; mapping service. Mandatory DDD, TDD, SOLID, Clean Architecture and security-by-design. This checkpoint changes testing and release safety, not legal verification authority.

## Existing blocker (confirmed 8 November 2026)
The packaged source has no `package-lock.json`, and the execution environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`). The API build fails on `TS2688` because `@types/node` is not installed. No full React/NestJS build or live database test has passed here.

## Connected Kali Linux validation
Run from project root. Use Node 22.12+ and npm 10+ (ensure `node -v` and `npm -v`).

```bash
# Do not reuse production credentials.
npm install --package-lock-only
npm run verify:v17
npm run release:gate:v17
npm ci
npm run verify:v16
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

Inspect and commit the generated `package-lock.json` with the matching package manifests. If either lock gate fails, fix the manifest/lock drift with the package manager; do not hand-edit SRI hashes or create artificial package entries.

On the first successful install, optionally audit dependencies and read security advisories (`npm audit`). CI must use `npm ci`, not `npm install`. Generated keys should never be committed.

## Database and HTTP workflow
Only after `npm run build` succeeds, provision a **disposable** `assettrust_ci` or `assettrust_test` PostGIS database. Consult `docs/V15_RUNBOOK.md` for required local identity markers and secret management. Never use live ownership records, customer identities, or production files.

```bash
# Configure .env for your disposable environment first.
docker compose up -d postgres
npm run db:migrate
npm run db:check
# Run supervised integration using the runbook's exact disposable CI environment.
```

A new installation may run the normal migrations. An existing customer or long-running development database must use the explicit backup/baseline upgrade process in `docs/V11_MIGRATION_AND_RELEASE.md`, not the fresh-install commands.

## Expected passing proof for v0.18 readiness
- `npm ci` completes with a reviewed committed lockfile.
- API and React production builds both succeed.
- PostgreSQL migrations and readiness endpoint pass.
- Authentication/MFA, professional approvals, tenant isolation, encryption, cases, parcel-boundary APIs, and browser navigation pass integration/e2e tests.
- Any remaining third-party/authorized registry integrations are reported as unavailable until legitimately connected.

**No production release is approved by v0.17.**
