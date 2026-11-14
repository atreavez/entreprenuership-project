# AssetTrust v0.23 — Transactional Asset and Case Authorization

- Added `requireCurrentAssetContribution` and `requireCurrentCaseContribution` infrastructure checks.
- Rechecked organization membership and current contributor rights within document and parcel write transactions.
- Locked current asset, user, case and grant records while relevant operations commit.
- Preserved serialized land-review asset locking; blocked writes on downgraded, expired or revoked grants.
- Cleaned staged encrypted uploads if the transactional authorization check fails.
- Added 14 offline tests plus a disposable PostgreSQL SQL smoke script and isolated TypeScript typecheck.
- Updated older surveyor/MFA repository tests to resolve the actual shared authorization adapter.
- Wired v0.23 test and SQL smoke script into CI.
- No new UI screens or SQL migrations in this security-focused checkpoint.
- Remaining blockers: authentic lockfile, full build, live PostgreSQL/HTTP/browser tests.

**Release decision: BLOCKED (development security checkpoint only).**
