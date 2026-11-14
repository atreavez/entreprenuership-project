# AssetTrust v0.37 - PDF report export and detached cryptographic receipt

## Security and domain architecture

**Purpose:** Give current organization administrators a print-friendly, verifiable copy of a previously issued non-official evidence report, without changing the immutable issued report, recording new governmental assertions, or exposing private facts on public QR routes.

- `apps/api/src/contexts/report-issuance/domain/signed-pdf.ts` is the framework-free policy and PDF/Ed25519 module. It accepts the already-validated v0.36 bundle payload, renders PDF 1.4 A4 pages with standard PDF fonts and builds a domain-separated, signed detached receipt. No Nest, PostgreSQL, DOM or browser APIs are imported.
- `apps/api/src/contexts/report-issuance/infrastructure/report-issuance.module.ts` implements `GET /api/v1/reports/issued/:id/pdf-export`, scoped to the currently authenticated organization's `organization_id`. Fresh MFA step-up and present-day organization administrator status are checked in the same transaction. The original immutable snapshot's stored SHA-256 digest is verified before rendering.
- Each downloaded PDF has a separate `*.receipt.json`. The receipt signs the exact PDF SHA-256, original issued snapshot SHA-256, report ID, issued/export timestamps, current-at-export status, rendition profile, non-official legal disclaimer and public status path.
- `tools/verify-report-pdf-v37.cjs` independently verifies receipt schema, trusted Ed25519 public key, signature and SHA-256 of exact PDF file bytes. Requires no npm packages or network service.
- `apps/web/src/ReportIssuancePage.tsx` provides an admin action that downloads both local browser blobs; the public verification page is unchanged and does not gain access to PDF, receipt, case details or evidence.

## Cryptographic trust and scope

Signed bytes: `UTF8("ASSETTRUST-DETACHED-PDF-RECEIPT-V1\\n" + canonicalJSON(payload))`. The signer key is the existing `ASSETTRUST_REPORT_SIGNING_KEY_ID` and `ASSETTRUST_REPORT_SIGNING_KEY_PKCS8_B64`; private keys are server-only. The public key must be independently pinned before verification. This signature is generated at **download time**, NOT backdated to the original issue date.

`pdfSha256` is a digest of all exact PDF bytes. The signed receipt's `snapshotSha256` binds metadata to the originally recorded immutable source fingerprint, but the PDF is a printable view of selected snapshot fields. If every source field or exact multilingual spelling matters, request the full v0.36 signed JSON bundle through the separately protected export action.

**Do not claim PAdES.** The PDF contains no embedded PDF-native cryptographic signature; verification requires its separate receipt and the trusted external keyring. There is no independent timestamp authority or government record. A valid signature confirms the configured signer generated or approved the PDF-byte representation; it does not confirm ownership or government approval. A once-valid PDF may later be withdrawn or superseded; the QR or public verification URL must be checked again.

## Confidentiality and governance

Only active organization admins with recent MFA may export the PDF. Sensitive PDF content is never available on public endpoints. No private evidence is placed in receipt metadata. Every export is audited (`REPORT_PDF_EXPORTED`) with report, key, export timestamp, state, source and PDF fingerprints. The public signing-key endpoint is not an independent trust anchor. Rotate keys with a secure out-of-band process and retain trusted historical verification keys. Do not expose keys through tenant-facing configuration. The global super admin may govern key metadata later, but not edit cryptographic or identity/security policy arbitrarily.

**Printable text limitation:** PDF standard built-in Helvetica fonts render ordinary ASCII. The renderer transliterates simple Latin accents and visibly uses `?` for other code points. This limitation is disclosed in the PDF. Full Unicode font embedding, accessibility tags, professional long-form typography, and native PDF signatures require subsequent development and browser-based PDF QA.

## Acceptance tests and release gates

- v0.37 synthetic tests cover PDF validity and text extraction, multiple pages, escaping, byte tampering, signature tampering, trust failures, case status and service tenant/MFA/audit/integrity boundaries.
- Historical version-specific source checks v0.03-v0.36 and architecture/syntax scans were executed offline.
- Remaining production blockers: no authentic package-lock and `npm ci`, no installed Nest/React dependencies or full builds, no actual authenticated HTTP/browser flow, no PostgreSQL/PostGIS live contracts, no distribution/revocation security ceremony, no professional/legal assessment, no recipient-sharing workflow.

**Verdict:** Offline-tested source checkpoint only. No production claim.
