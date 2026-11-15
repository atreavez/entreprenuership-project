# AssetTrust v0.38 — Governed organization PDF layout

**Date:** 11 November 2026  
**Status:** Offline-tested development checkpoint; not production-ready.

## Change delivered

- New organization admin interface on the Report Issuance page for printable PDF heading, footer, and dark accent color, with a local preview.
- Propose / approve / reject endpoints with fresh MFA, current `ORG_ADMIN` role, independent second administrator, organization scoping, pessimistic transaction locks, an expected revision, and append-only change history.
- `016_report_pdf_layouts.sql` adds a proposal queue, immutable approved versions and active version pointer, with tenant-composite foreign keys, one-pending-per-org uniqueness, historical update/delete guards and forward-only active version enforcement.
- Authenticated PDF export now resolves the current approved organization layout and passes the approved presentation into the existing report renderer; the original report contents and cryptographic receipt algorithm are unchanged.
- The PDF shows its approved presentation revision when a custom layout is used; the audit event stores `layoutRevision` alongside the PDF checksum.
- The fixed non-official / no-ownership-certificate warning remains present and is deliberately not editable from the control plane.
- Security tests cover malformed input, misleading legal claims, color contrast, self-approval, replay, cross-organization access, stale expected versions, MFA, snapshot preservation and signed-PDF integrity.

## Explicit non-goals

- No arbitrary HTML/CSS, uploaded logos, template code or user-created rendering scripts.
- No changes to issued evidence snapshots, PDF legal-warning text, public verification endpoints or signing-key format.
- No external-recipient sharing, provider-backed delivery, key rotation/retirement, or native PDF/PAdES signature yet.
- No claim of official government registry integration or evidence truth.

## Upgrade and verification

Run `npm run verify:v38`, legacy verification suites, and architecture/syntax checks on a clean checkout. Before applying SQL migration 016 to any existing database, back up and prove a restore, verify earlier ledger checksums, and obtain appropriate change approval. See `V38_KALI_VALIDATION.md`.
