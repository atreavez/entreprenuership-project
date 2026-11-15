# AssetTrust v0.81 — Test Evidence

**Execution:** 12 November 2026, offline authoring container. **Production readiness: NO-GO.**

## New v0.81 regression suite

`npm run verify:v81` — **PASS 35/35** cases, zero failures. Tests compile and execute the actual framework-independent runtime policy with TypeScript and verify production/development/test behavior, safe marker ownership, CORS normalization, sanitized error reporting, and use of shared policy by the NestJS listener. The tests **do not boot NestJS or PostgreSQL**.

## Historical and integrated checks

`npm run verify:v41` through `npm run verify:v81` — **PASS 41/41 suites, 770 counted TAP passes, zero failures**. The v43 snapshot test initially asserted the previous inline production bind string. It was updated to assert the new call and the domain policy's loopback rule; then the full matrix was rerun successfully. `verify:architecture`, `verify:syntax`, `verify:ci:v53`, `build:imports:v80` and `build:source:v56` passed.

The detailed per-version matrix is in `V81_REGRESSION_MATRIX.json` included in this ZIP.

## Explicit blockers

- Full `npm run build`: **FAILED** because real workspace dependencies (`@nestjs/common`, `pg`, `express`, `@types/node`, etc.) are absent; no semantic typecheck result is possible.
- `npm ping --fetch-retries=0 --fetch-timeout=2500`: **FAILED** `EAI_AGAIN registry.npmjs.org`.
- `npm run release:preflight:v51`: **BLOCKED** because the authentic reviewed `package-lock.json` is missing.
- `npm run security:scan:v43`: **PASS** for limited high-confidence current-source patterns; no full Git-history or independent secret-scanner proof.
- Real migrations, live PostgreSQL/PostGIS and ClamAV, authenticated HTTP/browser, concurrency, rollback/recovery, deployment, and security release: **NOT RUN** in this environment.

Source-version regressions are unit and static tests. They cannot be interpreted as proof of real deployment or payment readiness.
