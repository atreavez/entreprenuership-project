# AssetTrust v0.7 — Secure Document Vault and Upgrade Safety

**Compiled by Aturinzire Hargreave — 7 November 2026**

This checkpoint extends the actual v0.6 source and retains existing assets, evidence-review rules, professional accreditation, session security, organization management and React pages.

## Changes

- Document domain rejects unsupported types, wrong magic bytes, empty files and files larger than 5 MiB.
- Introduced `EncryptedBlobStore` application port with AES-256-GCM encrypted local adapter. The pure domain and port do not import NestJS, PostgreSQL or HTTP libraries.
- Document metadata is cryptographically bound to ciphertext using authenticated additional data (organization ID, document ID, SHA-256), preventing copied blobs from being decrypted under another record.
- Random 96-bit nonce per stored document, authenticated tag, explicit format header and key ID for rotation.
- Uploaded bytes are never written to the private blob directory in plaintext. Local filesystem directory 0700 and blob 0600 permissions on Unix; rejects path traversal and symlink reads.
- PostgreSQL migration 006 distinguishes legacy plaintext records from encrypted records and records key identifiers.
- Reader refuses legacy plaintext until a deliberate offline migration; operator script supports retrying an interrupted migration.
- Documents page now shows encryption status, distinct from human evidence-review status. Web downloads use refresh-safe authenticated requests.
- Existing local integration smoke test now checks ciphertext on disk and cross-tenant download denial.
- CI workflow includes new offline encryption tests and test-only key configuration.
- Desktop/mobile **source-derived UI previews**, **15** focused tests, requirements and release-gate documentation.

## Compatibility

**Upgrading an existing v0.6 dataset requires an explicit offline plaintext-to-encrypted migration.** Before running v0.7 against previous live data: stop the API, back up the database and `UPLOAD_DIR`, configure the new keyring, apply migration 006, and execute the documented operator command. Until then, old plaintext files cannot be downloaded. Encryption is not a substitute for access authorization, professional review, or official registration.
