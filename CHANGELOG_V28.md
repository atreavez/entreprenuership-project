# AssetTrust v0.28 — Admin Control Plane Foundation

Compiled by Aturinzire Hargreave.

- Appended `009_admin_control_plane.sql` with platform-admin appointment, current configuration values, audited proposals, review status and one-pending-change-per-key constraints.
- Added a domain allowlist for platform and organization configuration with types, validation, impact flags and safe disallowed settings.
- Added authenticated `/api/v1/admin-control` routes for catalog, current settings, proposals, independent decisions, history and limited platform directory metadata.
- Enforced current DB role, live session, MFA and independent platform appointment. All writes require a recent MFA step-up. High-impact edits require a *different* approving admin.
- Implemented key-level advisory lock, applied-version optimistic concurrency, current proposal revalidation and audit-chain recording. Corrected review lock ordering to avoid proposal/review deadlocks.
- Added a trusted DB-operator-only, dry-run-first initial platform-admin bootstrap; no public self-promotion route exists.
- Added responsive React Admin Control Plane page, scoped tabs, configuration cards, pending approvals and organization directory. Display workspace name is read from the applied settings and displayed in the topbar.
- Added offline security tests, checksummed schema contract, disposable PostgreSQL test script and CI test steps.
- Preserved all existing modules, previous migrations and evidence integrity guarantees.
- Corrected historical migration-baseline logic to cap **legacy baseline** at eight migrations, leaving 009 unapplied until actual execution.

Not yet delivered: fully configurable billing, permissions, forms, workflows, provider secrets, live notifications, official registries or evidence report template authoring. A successful `npm ci`, full build, live PostgreSQL API and browser integration remain mandatory release gates.
