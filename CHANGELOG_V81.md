# AssetTrust v0.81 — Fail-Closed API Startup and Disposable Test Isolation

**12 November 2026 · development checkpoint · production NO-GO**

- **Authentication startup:** `LOGIN_ABUSE_PEPPER` is mandatory and must be a valid independent 32-byte key in development, test, **and** production. Earlier development startup could succeed while login necessarily failed; this is now rejected before traffic is accepted.
- **Network input:** `PORT` must be a decimal integer in 1–65535; the listener uses the same validated parser. The default remains 4000.
- **CORS contract:** startup validation and `app.enableCors` now share the exact trimmed list of validated `WEB_ORIGIN` entries; no hidden localhost fallback or whitespace-damaged allowlist.
- **Disposable API isolation:** non-empty `ASSETTRUST_E2E_TARGET_ID` requires `NODE_ENV=test`, a safe marker, and matching expected ID when provided. `ASSETTRUST_E2E_ALLOW_MUTATION=YES` requires test mode and an owned marker. Test mode always binds to loopback; explicit public test binds are rejected.
- **Regression and CI:** 35 new tests, CI execution and 41/41 source-version suites passing (770 counted test cases). An obsolete v43 test was updated to check the new loopback implementation rather than its old source-code string.
- Three workspace manifest versions changed to `0.81.0`. No database migration, RLS definition or payment workflow changed.

These are **source/offline** changes. Authentic lockfile, dependency-backed compilation, live PostgreSQL/HTTP/browser acceptance, deployment, Git-history scanning, and final security sign-off remain unverified. See `V81_HANDOVER.md`.
