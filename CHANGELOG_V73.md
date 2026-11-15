# AssetTrust v0.73 — Transactional Document Download Authorization

**12 November 2026 — engineering checkpoint, not production approved.**

- Fixed document-read permission race: single tenant-scoped transaction, document metadata row lock, current member/asset/case/grant locks, encrypted blob read and SHA-256 validation before commit.
- Added explicit denial for orphaned document records and maintained case confidentiality separate from asset sharing.
- Added disposable, explicitly authorized live HTTP document-sharing and revocation acceptance suite, and connected it as the sixth supervised suite.
- Added 31 offline regression tests, registered `verify:v73` in CI and the root package, and advanced all workspace versions to 0.73.0.
- Passed recorded v41–v73 regression scripts, CI, source syntax and architecture checks. Preserved all 27 SQL migrations.
- **Blocked:** genuine lockfile, full dependency-backed build, live PostgreSQL/ClamAV and authenticated end-to-end acceptance; original Git-history and complete security release gates remain outstanding.
