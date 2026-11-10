# AssetTrust v0.19 — authentication response hardening

Compiled by Aturinzire Hargreave.

## Changed

- **Fixed a timing-related account-enumeration weakness at the login boundary.** Previously the `AuthenticationService.login` path short-circuited password verification when the email lookup had no corresponding user. It now runs `argon2.verify` once for both an unknown user and an existing user, using a fixed, publicly safe Argon2id dummy digest when no stored credential exists. Both invalid cases continue to return `Incorrect credentials`.
- Added source-derived, dependency-isolated regression tests for the real login service method: unknown-email and wrong-password work paths, successful-login flow, and dummy-hash constant placement.
- Wired `verify:v19` into the GitHub Actions offline verification step.
- Bumped workspace package versions and health response to v0.19.
- Preserved all pre-existing frontend/backend/migration/mapping code; no new UI screens.

## Limitations and release decision

- This reduces, but does not mathematically eliminate, timing differences: database lookups, network jitter, and system load vary. Registration still intentionally returns a conflict for a duplicate email and therefore exposes that specific existence signal. Further account-enumeration policy review is needed.
- Full application build not verified: `TS2688` missing Node type definitions. `npm install` could not reach npm registry (`EAI_AGAIN`). No authentic root `package-lock.json` exists.
- No live NestJS/React or PostGIS test was run. Release remains BLOCKED.

## Standards

DDD, TDD (observed RED to GREEN), SOLID, Clean Architecture (domain/application boundary checks), and Security by Design remain the baseline. Authentication changes stay in the authentication service/infrastructure boundary; no domain coupling added.
