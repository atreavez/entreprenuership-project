# AssetTrust v0.25 Changelog

- Added transaction-time verification actor and trust adapter; current role/accreditation are used by review, readiness and advancement instead of cached token assertions.
- Added locked, same-organization, stage-appropriate case assignment authorization with accreditation checks.
- Added pure domain rule for stage-qualified assignments.
- Preserved existing verification, mapping, vault, authentication and UI modules.
- Added 21 targeted tests and strict isolated type check; adjusted existing v0.4/v0.24 harnesses to load the new contracts.
- Added guarded rollback-only PostgreSQL test and CI stage.
- Offline regressions pass. Full application build, authentic dependency lockfile, and live PostgreSQL/browser tests **remain blocked**.

See `docs/V25_WORKFLOW_AUTHORIZATION.md`, `docs/TEST_EVIDENCE_V25.md`, and `docs/V25_KALI_RUNBOOK.md`.
