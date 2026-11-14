# AssetTrust v0.37 - Private PDF report + detached signature receipt

This is a source checkpoint, **not** a production release or an official land registry certificate.

- Added a self-contained, framework-independent A4 PDF renderer for non-official issued evidence reports (`apps/api/src/contexts/report-issuance/domain/signed-pdf.ts`). It uses built-in Type1 PDF fonts and no third-party render or upload API.
- Added a report PDF export endpoint requiring current organization-admin membership, fresh MFA, tenant-scoped SQL reads, SHA-256 validation of the issued snapshot, configured Ed25519 key, and an audit entry. The response contains a base64 PDF and separately signed receipt, with `Cache-Control: private, no-store`.
- Added browser UI to download both files from the same authenticated action. Users must retain the matching detached receipt and separately trusted public key.
- Added npm-independent CLI for verifying exact PDF bytes against an Ed25519 receipt and independently pinned SPKI public key. Modification, forgeries, unknown keys and invalid fields fail closed.
- Report shows status as of export, full included evidence rows, timestamps, digest, classifications, notice and a reminder to check current public status. Withdrawn, superseded and under-review states remain conspicuous.
- Added PDF rendering, pagination, adversarial input, CLI verification, service authorization, integrity, tenant isolation and state precedence tests. Existing version-specific regression tests v0.03-v0.36 remain passing after isolated loader compatibility changes.
- No new SQL migration, database schema, private-key storage table or release gate bypass.

**Important limitations:** This is **not a PAdES-signed PDF**, an official title/ownership document, trusted timestamp, blockchain proof, or full multilingual typography renderer. The PDF receipt cryptographically verifies the exact PDF bytes and metadata, not the legal truth of its evidence. Printable text uses standard PDF ASCII-compatible fonts, with non-supported characters visibly replaced with `?`; the original signed JSON record remains the authoritative source for exact source wording. Recipient authorization/secure sharing, long-term revocation, complete builds, live DB tests, and professional/legal review remain pending.
