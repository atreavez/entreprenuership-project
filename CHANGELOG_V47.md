# AssetTrust v0.47 - Core Tenant Relationship Integrity

Date: 11 November 2026. Security release: **NO-GO**.

## Implemented

- Added forward-only SQL migration `022_core_tenant_relationship_integrity.sql`.
- Added four composite `UNIQUE` keys supporting organization-aware foreign keys.
- Added eleven validated composite foreign keys across assets, cases, evidence and document metadata. They block wrong-tenant creator, assignee, recorder, reviewer, uploader and parent references, and a document that names an asset different from the one associated with its case.
- Migration deliberately fails atomically if existing historical data violates these relationships. There is no automatic data deletion, constraint bypass, or `NOT VALID` shortcut.
- Added a read-only pre-migration integrity audit in `tools/sql/v47-core-integrity-audit.sql`.
- Added a guarded disposable PostgreSQL contract (`tools/e2e-pg-core-relations-v47.mjs`) that tests legitimate A/B fixtures and adversarial cross-tenant inserts/updates.
- Added ten new offline checks and CI coverage. The v0.46 historical test now checks the original migration by position rather than incorrectly requiring it to be the last migration forever.
- Pinned the byte-for-byte SHA-256 of migration 022 in the append-only migration manifest.

## Explicitly NOT implemented or proven

- New row-level security for core asset/case/evidence/document tables. The prior v0.46 RLS still covers only three PDF-layout tables.
- Live PostgreSQL execution of migration 022 or its contract (PostgreSQL and npm dependencies are unavailable in this environment).
- Clean npm installation, full application build, full API test, browser tests, cross-instance traffic tests, network/TLS/SSH inspection, historical Git secret scanning or dependency audit.

The change is **database referential integrity**, a prerequisite to broader RLS, **not read-access authorization**. Apply only after backup and integrity review on a disposable clone; never claim the full database is tenant-isolated.
