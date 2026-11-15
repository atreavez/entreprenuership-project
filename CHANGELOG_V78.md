# AssetTrust v0.78 — Changelog

- Replaced indefinitely blocking advisory migration lock with fail-fast PostgreSQL `pg_try_advisory_lock` using a parameterized stable lock ID.
- Added explicit conflict diagnostics before any schema or ledger query, plus connection cleanup for failed connection attempts.
- Hardened ROLLBACK, COMMIT, advisory unlock and connection end failure handling. Preserve the first SQL failure and never report uncertain transaction outcomes as successes.
- Added `--baseline` + `--check` conflict rejection.
- Added 30 dependency-free fault-injection and Kali-wrapper security tests; adapted the v0.11 migration fake and one version-only v0.75 fixture.
- Added a read-only, opt-in, local-only real PostgreSQL acceptance covering lock contention and 27-file ledger consistency; wired offline and PG checks into CI.
- Set workspace versions to 0.78.0; retained all 27 SQL migrations and reviewed RLS policies without modification.
- **NO-GO:** full dependencies, actual build, real PostgreSQL and final security approval are still pending.
