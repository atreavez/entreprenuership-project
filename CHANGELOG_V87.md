# AssetTrust v0.87 — Changelog

## Continuous build-integrity enforcement

- Added v0.87+ provenance checks at each disposable acceptance stage and immediately before/after every supervised external command. Stops further migration, policy or HTTP actions when source, outputs, manifest, lockfile or supervised build evidence changes.
- Recorded `BUILD_INTEGRITY_DRIFT` and private per-run integrity-check counts without capturing credential-bearing command logs.
- Exposed continuous integrity readiness in read-only Kali `--plan` and `--inspect` outputs; added v0.87 plan/inspect/run scripts.
- Added final CI provenance verification after all live disposable PostgreSQL/HTTP suites.
- Added 30 real-hash/synthetic-child offline regression tests, including before/after baseline tests (27 fail on v0.86).
- Updated two v0.86 test fixtures to avoid incorrectly failing when a real Kali supervised build genuinely succeeds.
- Advanced root/API/web manifests to 0.87.0. Preserved all 27 SQL migrations, API routes, domain logic and user-facing features.

**Testing:** 47 suites, 979 offline cases passed. Actual npm compile, PostgreSQL, browser and production release are still blocked or outstanding.
