# AssetTrust v0.40 — Shared recipient access abuse controls

11 November 2026. Engineering development checkpoint; **not a production release**.

## Delivered

- Added `018_recipient_attempt_windows.sql`, a forward-only, tenant-scoped table for **known** share IDs. It stores an aggregate failure count, window start and last failure time. It does not store credentials, IP addresses, user agents, or failed request contents.
- Redemption checks the shared counter with a row lock. Ten failed credentials during a 15-minute window block even valid credentials until the window expires, limiting repeated guessing across multiple API instances connected to the same database.
- Failed requests commit their increment before the service returns a generic unavailable response. This is intentional: throwing before transaction commit would roll back the safety counter.
- Organization administrators can view recent 5+-failure warnings through the existing share administration page and revoke suspicious grants. Warnings are tenant-scoped and do not reveal secrets.
- Added a guarded, rollback-only PostgreSQL contract test and a read-only release readiness script.
- Preserved v0.39 dual-administrator approval, expiry, revocation, successful-redemption audit, report-status checks and signed PDF delivery.

## Validation and limitations

- 11/11 new v0.40 offline tests passed; 38/38 `verify:v03` through `verify:v40` commands passed. Architecture and source syntax checks passed (92 TS/TSX files).
- PostgreSQL/PostGIS live execution, full dependency install and build, authenticated browser tests, TLS controls and third-party assessment are **not tested here**.
- A malicious party knowing a real Share ID can intentionally trigger a temporary 15-minute lockout. This is a conscious availability/security tradeoff. Reverse-proxy abuse protection and incident response remain mandatory.
- These are bounded, mutable operational counters, **not immutable security evidence**. They cannot establish a recipient's identity.
- Security thresholds are conservative code-level defaults in this checkpoint; platform-controlled changes and approval of tuning rules require a separate safe governance implementation.

Detailed steps and release blockers: `V40_KALI_VALIDATION.md`, `TEST_EVIDENCE_V40.md`.
