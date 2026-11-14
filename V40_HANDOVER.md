# AssetTrust v0.40 handover

- **Checkpoint archive:** `AssetTrust_v40_Shared_Recipient_Access_Hardening_Checkpoint.zip` — full updated source tree and versioned historical tests.
- **New data:** forward-only migration `018_recipient_attempt_windows.sql` containing a share-tenant-bound, fixed-window failed-attempt counter. Historical migration SQL is unchanged.
- **Behavior:** ten failures in 15 minutes temporarily block a known report share across API instances using the same PostgreSQL database; at five failures the organization admin console shows a warning. The response to a denied recipient stays a generic 404. No secret or IP is written to the counter table.
- **Validation:** 11 v0.40 tests and 38 historical/current offline version commands pass; 92 source files pass syntax transpilation. Read-only release preflight correctly blocks on the missing lockfile/dependencies and .env. Database and browser gates are unverified.
- **Safety:** the counter is operational and mutable, not an immutable forensic event. Share-ID-based rate limits can be weaponized for a short lockout. Reverse-proxy abuse protections, recipient identity confirmation, secure key custody and external security review remain necessary.
- **Recommended next:** v0.41 should prioritize genuine `npm ci`, complete production builds, an authorized disposable Postgres migration/contract run, two-instance concurrency verification and authenticated Playwright browser flows. Do not bypass gates by accumulating more UI features.
- **Operator starting point:** `V40_KALI_VALIDATION.md`.
