# AssetTrust v0.86 — Changelog

**2026-11-12 — Complete-output build provenance and Kali release-evidence consistency**

- Added content-addressed SHA-256 inventory covering **every** emitted runtime file under `apps/api/dist` and `apps/web/dist`; refuse symlinks, nonregular and missing/oversized compiled files.
- Added read-only `tools/acceptance-provenance-v86.cjs` to compare a supervised build report with the **current** source, complete compiled outputs, lockfile, manifests, active artifact policy and all seven completed commands.
- Made `kali-acceptance-v71.cjs` require strict provenance at package v0.86 and above; older historical fixtures remain unchanged but are never accepted for the v0.86 build.
- Added a CI step performing the real supervised build and v0.86 provenance inspection before disposable live database testing.
- Added 34 new synthetic regression cases plus `verify:v86`, `acceptance:provenance:plan:v86`, and `acceptance:provenance:inspect:v86`.
- Bumped root, API and web manifests to `0.86.0` and preserved all 27 SQL migrations byte-for-byte.
- Retained strict **NO-GO** release status due to no actual npm dependency-backed build, real PostgreSQL acceptance or full security release evidence.
