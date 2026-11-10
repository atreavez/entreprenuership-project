# AssetTrust v0.16 — Reproducible build release gate

- Introduced automated repository-level release policy tests (lockfile presence/integrity, workspaces, clean dependency installation, builds, migration checks, supervised integration).
- Updated GitHub CI to use `npm ci`; this intentionally blocks until a reviewed lockfile is committed.
- Added `npm run verify:v16` (offline tests) and `npm run release:gate` (strict, expected to fail without lockfile).
- No fabricated lockfile or unsupported production-readiness assertion.
- No feature changes to existing user interfaces or verification domain.

**Current blocker:** npm registry access unavailable in creation environment; actual `npm install` and live PostgreSQL tests remain unverified.
