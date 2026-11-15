# AssetTrust v0.77 changelog

- Fix cross-case dispute flag-clearing bug: an asset with any pending dispute across its cases stays `FLAGGED`.
- Serialize dispute writers on the common asset row before case/dispute locks.
- Detect case asset reassignment while acquiring locks, fail closed and rollback.
- Revalidate the current actor's organization and participation before locking and writing.
- Add 22 source-level cross-case security tests and 12 private integration-runner safety tests.
- Add guarded, real PostgreSQL (restricted runtime role) service acceptance for two-case concurrency on disposable Kali.
- Wire source and live DB tests to CI without changing source SQL migrations or the RLS contract.
- Preserve mandatory security release NO-GO until authentic dependencies, full build, PostgreSQL, browser, and final audit pass.
