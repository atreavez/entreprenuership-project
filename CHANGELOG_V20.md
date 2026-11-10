# AssetTrust v0.20 — MFA downgrade and boundary-review hardening

**Compiled by: Aturinzire Hargreave**

## Security fixes

1. **Clear MFA step-up after disabling MFA.** `AuthenticationService.disableMfa` clears `auth_sessions.mfa_verified_at` for **all** of the user's sessions inside the same database transaction that deletes MFA credentials and revokes other sessions. The currently authenticated session may continue ordinary requests but cannot retain a previous privileged step-up.
2. **Recheck MFA enrollment when reviewing parcel boundaries.** `PgParcelRepository.review` now joins `auth_mfa_credentials` to require `m.enabled=true`, a live unrevoked and unexpired session, and MFA verification within 15 minutes. PostgreSQL row locks (`FOR SHARE OF s,m`) prevent a concurrent credential disable from racing the parcel-review authorization check.
3. **Regression and CI coverage.** Tests execute the transpiled AuthenticationService and PgParcelRepository against controlled SQL adapters. CI runs `verify:v20` alongside existing suites.

## Verification and release limitations

- New tests **7/7 passed** after test-first RED failure evidence.
- All prior offline verification commands **passed**.
- Node/React full build **not verified**: `npm run build` fails `TS2688`, missing Node type definitions.
- Authentic `package-lock.json` is still **absent**, release gate **fails**.
- npm registry lookup **failed** (`EAI_AGAIN`), so dependencies cannot be installed in this environment.
- No PostgreSQL/PostGIS service was available here; no live database or browser integration tests were run.

**Release status: BLOCKED. Do not deploy to production.**
