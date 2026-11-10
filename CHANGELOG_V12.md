# AssetTrust v0.12 — Integration Safety & Configuration Hardening
**Compiled by Aturinzire Hargreave** | 7 November 2026

## Why this milestone
v0.11 had no verified live PostgreSQL/NestJS/browser build. v0.12 does not pretend to solve the unavailable build environment. It adds testable, framework-independent startup security policies and refuses unsafe integration-test mutations, while preserving all existing modules.

## Implemented
- New pure platform domain policy `runtime-config.ts`: rejects JWT placeholders and suspiciously weak secrets; requires a usable independent MFA key and valid document keyring; checks active key and key reuse; validates PostgreSQL connection URL and explicit web origins; rejects development credentials, HTTP origins and test markers in production; rejects unknown NODE_ENV aliases such as `prod`.
- API bootstrap evaluates config **before NestJS starts accepting connections**; validation errors only show issue codes, never secret contents.
- New `tools/e2e-safety.mjs`: tests must opt into mutations, target a bare local HTTP origin and verify an exact disposable-instance marker exposed from non-production `/api/v1/healthz`.
- Consolidated this guard into all four existing mutating HTTP suites: `e2e-smoke`, `e2e-identity-v05`, `e2e-geo-v08`, `e2e-overlap-v10`.
- Production API never publishes a test marker; a configured production marker prevents application startup.
- CI sets matching disposable test markers and runs `verify:v12` before build or integration tests.
- Added v0.12 TDD tests (RED and GREEN evidence), update to README, and a repeatable Kali live-integration runbook.

## Not implemented or verified
- No new land-ownership certification, payment gateway, government-registry access, or blockchain integration.
- No PostgreSQL service or Docker runtime in this artifact environment; real transactions are not tested.
- `npm install` failed due unavailable registry (`EAI_AGAIN`); offline install failed with `ENOTCACHED`. Full build fails with missing `@types/node`. Those results are release blockers.
- Existing public preview UI has **not** been changed in this milestone; previous v0.11 renders are retained for reference.

## Next release gate
On a connected, disposable Kali development environment: `npm install`, fresh PostGIS migration, `npm run build`, API/browser smoke tests and role/tenant security tests. Only call the release production-ready after those and the outstanding legal/external-integration gates are reviewed.
