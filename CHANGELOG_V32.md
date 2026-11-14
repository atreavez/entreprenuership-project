# AssetTrust v0.32 — Published Content Integration

- Added a pure publishing policy and read-only published-content infrastructure adapter, enforcing source (`APPROVED`/`DEFAULT`), strict template keys, safe placeholders and revision numbers.
- Wired approved organization `report.summary` wording into existing authenticated report JSON and the React Evidence Reports page, with a fixed immutable non-official legal notice.
- Wired published `notification.case_assigned` wording into the existing transactional case-assignment in-app notification. Current recipient/case/organization details are read under the active tenant in the transaction.
- Added a publicly readable **allowlisted** endpoint for approved global website headline/support copy, consumed by the React sign-in page.
- Added a disabled-by-default external delivery port for future email/SMS providers; no external messages are sent or claimed.
- Updated Admin Content Studio with an integration status panel and clear out-of-scope labels.
- Added 13 new passing offline tests and a disposable PostgreSQL contract script, registered in CI.
- Preserved migrations 001–012 unchanged. No migration 013 is required.
- Updated historical v0.24/v0.25 test loaders to support the new dependency while preserving their permission scenarios.
- Full build and live PostgreSQL/browser checks remain blocked/unexecuted in this environment; **not production-ready**.
