# AssetTrust v0.14 — Integration Contract & CI Identity Safety

**Compiled by Aturinzire Hargreave — 7 November 2026**

- Added identity-bound, fail-closed test-server readiness with a health-marker check before database readiness.
- Prevented an unrelated localhost API from being mistaken for the supervised test process.
- Added offline build-prerequisite diagnosis and pure TDD policy tests; absence of npm packages is clearly reported rather than hidden.
- Updated the CI pipeline to run the new preflight and v0.14 tests.
- Preserved all previous backend/domain modules, UI screens, migrations, encrypted documents, and mapping infrastructure.
- Added RED/GREEN test evidence and a Kali integration runbook.

**Not verified**: application production build, actual PostgreSQL/PostGIS operations, browser E2E, regulatory integrations.
