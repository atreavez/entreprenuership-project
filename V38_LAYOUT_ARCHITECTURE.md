# v0.38 — PDF presentation governance and security architecture

## Domain boundary

`apps/api/src/contexts/report-issuance/domain/report-layout-policy.ts` is a dependency-free bounded-domain policy for exact-field validation, printable ASCII labels, misleading official certification claims, minimum header contrast, change reasons, and expected versions. The allowed layout contains only `headerTitle`, `footerNote` and `accentHex`. It cannot contain executable code or alter the evidence, result, public verification address, signatures or legal status.

`apps/api/src/contexts/report-issuance/domain/signed-pdf.ts` accepts an optional approved presentation and prints the layout revision; the legal warning is hard-coded and the report snapshot comes from the original immutable issuance. The v0.37 detached receipt still signs the exact PDF SHA-256; old receipts remain verifiable.

`apps/api/src/contexts/report-layout/infrastructure/report-layout.module.ts` performs database operations, current-admin step-up, tenant access, independent approvals, audit and the authenticated PDF export integration. Database/HTTP and NestJS are absent from the pure report-layout policy.

## Approval state transitions

1. Administrator A with current `ORG_ADMIN`, enabled MFA and a step-up within the past five minutes proposes a layout and a 12–500 character justification, based on the currently active revision.
2. The server obtains an organization-scoped transaction advisory lock, checks no proposal is awaiting review, validates the fields and stores `PENDING` with the author's tenant-specific database FK. The change is not active.
3. A different active administrator B with fresh MFA decides `APPROVE` or `REJECT`. On approval the server revalidates the stored layout, verifies the proposer is still an active admin, checks the expected version, inserts an append-only approved revision and atomically advances the organization active pointer. On rejection it leaves the current design unchanged. Every decision is audited.
4. Admin PDF export reads the active tenant layout and invokes the v0.37 service with the same existing MFA/tenant/integrity/signing controls. The output signature covers exact PDF bytes, and `layoutRevision` is recorded in the export audit. Existing issued snapshots are never edited or replaced.

## Persistence controls

Migration `016_report_pdf_layouts.sql` creates the proposals, revision ledger and active pointer. Tenant-composite FKs prevent cross-organization actor references. A partial unique index permits only one pending proposal per organization. Immutable revisions reject UPDATE/DELETE. The proposal trigger permits just one terminal decision; active pointers may advance only one revision at a time. These protections assume restricted application database permissions: a superuser can still alter triggers and SQL history, so external backup and independent audit verification remain separate controls.

The platform Super Admin does not bypass organization MFA approval for tenant-level report presentation. Public verification exposes no private layout data; the admin-only design list is organization scoped. The branding preview contains fictional, non-authoritative content.

## Unverified integration gates

There has been no live PostGIS migration, authenticated HTTP/browser two-admin journey, full compiled frontend/backend build, production key lifecycle, penetration test or operational recovery drill in this environment. An offline mocked service test does not prove real PostgreSQL row-lock behavior. Do not treat this checkpoint as production-ready.
