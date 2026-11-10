# AssetTrust v0.21 — Current Surveyor Authorization

**Compiled by Aturinzire Hargreave**  
**Status: Security development checkpoint — release BLOCKED**

## Changes

- **Fixed a time-of-check/time-of-use authorization gap** in geospatial parcel reviews. The current professional accreditation, expiry/revocation, user role and organization are checked under transaction-scoped PostgreSQL row locks alongside MFA/session state.
- Retained independent reviewer and asset/tenant scoping checks.
- Added eight source-executed repository regression assertions with observed RED→GREEN history.
- Added six disposable PostgreSQL target-policy tests.
- Added a real PostgreSQL SQL-assertion script with synthetic records and rollback-only fixture, to run in CI after lockfile/build/migration gates are satisfied.
- Updated CI to include v0.21 offline and disposable Postgres tests.
- Updated recent security tests to prefer the locally installed TypeScript dependency, with an offline global fallback.
- Enabled API TypeScript `noEmitOnError`, removed failed-build output, and added build-safety tests; a failed build no longer emits partial API JavaScript.
- Updated package and API health version metadata to 0.21.0. No new UI screens.

## Verification and limitations

16/16 new offline tests and 22/22 available offline verification commands passed. **The complete build is still blocked by missing project npm dependencies; there is still no authentic `package-lock.json`; no live PostgreSQL or browser integration tests were executed.**

See `docs/V21_SURVEYOR_AUTHORIZATION.md`, `docs/V21_KALI_RUNBOOK.md`, and `docs/TEST_EVIDENCE_V21.md`.
