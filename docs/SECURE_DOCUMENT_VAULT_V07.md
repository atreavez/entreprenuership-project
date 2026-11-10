# v0.7 Secure Document Vault — Design, Security, and Operations

**Compiled by Aturinzire Hargreave | 7 November 2026**

## Architecture and DDD/Clean Architecture

```text
React Document Vault (browser, user consent)
             |
NestJS DocumentsController (HTTP adapter and AuthGuard)
             |
DocumentsService (current application orchestration / integration boundary)
             |
  +--------------------------+
  | Document domain policy   |-- MIME signature, size, storage identity
  | EncryptedBlobStore port  |-- put / get / delete
  +--------------------------+
             |
EncryptedLocalBlobStore (infrastructure adapter)
    AES-256-GCM envelope + tenant/document/hash AAD
             |
   Restrictive local filesystem (0700/0600)
             |
PostgreSQL metadata + organization-scoped access checks + audit event
```

The file policy and application port are independent of NestJS, SQL and HTTP. `DocumentsService` is still a legacy NestJS service that directly orchestrates PostgreSQL and access/audit dependencies. Moving DB metadata into a repository port is a **known remaining architectural task**, not a completed full Clean Architecture refactor. Future S3-compatible private object storage is possible via the same port but **not implemented**.

## Domain terms

A **document** is uploaded evidence attached to an asset or case. `SUBMITTED`, `REVIEWED`, and `REJECTED` describe human review state; `AES_256_GCM_V1` describes file storage encryption. Neither means the property has a legally recognized owner or that any government registry was checked.

## Threat model

| Threat | v0.7 protection | Remaining exposure |
|---|---|---|
| Storage disk disclosure | AES-256-GCM ciphertext and controlled filesystem modes | Keys on same compromised host; use a secret manager / KMS in production |
| Data corruption or tampering | GCM authentication, SHA-256 check | Database and operator compromise outside this boundary |
| Another tenant's encrypted file copied over this one | Tenant/document/digest AAD binding | API tenant isolation still needs live integration test |
| Path traversal or symlink | Strict UUID `.blob` names, `O_NOFOLLOW` | External privileged file-system actors remain powerful |
| Forged MIME extension | File signature checks and 5 MiB limit | Malware/PDF exploits; antivirus, CDR, and sandboxing are future work |
| Legacy unencrypted data | Default refusal to serve until migrated | Temporary downtime during planned upgrade |
| Key loss | Versioned key IDs and retaining previous keys | Lost key = unrecoverable encrypted files without backups |
| Unauthorized downloads | Asset/case access checks, AuthGuard, no-store, no sniff | Full authorization abuse tests still required |

## Envelope

```text
6 bytes   ASCII ATDOC1
1 byte    key ID length
1–48      ASCII key ID
12        unique random nonce
16        GCM authentication tag
remaining AES-256-GCM ciphertext
```

Additional authenticated data is `assettrust-document-v1|org UUID|document UUID|sha256 hex` (normalized to lowercase). Keys are configured by `DOCUMENT_ENCRYPTION_KEYS` (JSON string with hexadecimal 32-byte keys) and `DOCUMENT_ACTIVE_KEY_ID`. Do **not** use the JWT secret or MFA encryption key as a document encryption key.

**Rotation:** add a new key to the map, make it active, and keep all old keys for existing files. Re-encrypting all previous ciphertext under new keys and safe key retirement require a separate reviewed rotation job; switching `DOCUMENT_ACTIVE_KEY_ID` does not retroactively re-encrypt old files.

## New installation

From project root:

```bash
cp .env.example .env
openssl rand -hex 32  # generate JWT_SECRET
openssl rand -hex 32  # generate MFA_ENCRYPTION_KEY separately
openssl rand -hex 32  # generate DOCUMENT_ENCRYPTION_KEYS v1 separately
```

Replace placeholders in `.env` and set `DOCUMENT_ACTIVE_KEY_ID=v1`. `DOCUMENT_ENCRYPTION_KEYS` is JSON, e.g. `{"v1":"<actual 64 hex chars>"}`. Ensure secrets never enter Git, screenshots or browser bundles.

```bash
docker compose up -d postgres
npm install
npm run db:migrate --workspace apps/api
npm run verify:v07
npm run build
npm run dev:api  # terminal 1
npm run dev:web  # terminal 2
```

**Do not deploy** until these build and database steps pass on a real machine.

## Migration of existing v0.6 files

This upgrade must be a **maintenance window**. Stop the API and all writers; take and verify an offline backup of PostgreSQL and the full private upload directory; ensure sufficient disk space; inventory existing file counts and SHA hashes. Never point this script at production unless you have rehearsed rollback on staging.

1. Verify the existing private directory path. Workspace API writes relative paths from `apps/api` (unless `UPLOAD_DIR` is absolute); the migration command resolves this consistently.
2. Configure keys and run the SQL upgrade using `npm run db:migrate --workspace apps/api`.
3. After confirming backups and that the API is stopped, run:

```bash
ASSETTRUST_STORAGE_MIGRATION_CONFIRM=YES npm run storage:migrate:v07
```

4. The operator command verifies each legacy plaintext SHA-256, writes authenticated ciphertext atomically and updates its database row. It is restartable: encrypted files left after an interrupted metadata update are recognized and reconciled.
5. Run it again as a verification pass, review row counts, ensure no `LEGACY_PLAINTEXT` records remain and test encrypted downloads with real authorized/unauthorized staging accounts.
6. Start API after the full checklist passes. If migration cannot complete, **restore both the original database and file-directory backups together**; do not attempt a partial database-only rollback.

**Warning:** migration is intentionally not automatic, and historic files are unavailable until upgraded. Do not delete historical keys without a tested key rewrap or complete re-encryption plan.

## Future hardening backlog

- KMS/HSM-enforced key lifecycle, automatic audited rotation, disaster recovery and external key escrow policy.
- Antivirus/Content Disarm and Reconstruction (CDR), safe PDF previews, metadata redaction and per-tenant quotas.
- Store adapter for private S3-compatible object store, robust retry semantics, external backups, immutable retention and deletion governance.
- Metadata repository port and transactional outbox for consistency at high concurrency.
- PII retention policy, Ugandan privacy/legal assessment, independent pentest and key-loss drills.

## Test commands and honest scope

`npm run verify:v07` covers 15 offline file-domain, encryption, local-storage and boundary tests. Full TS type-check, actual React build, PostgreSQL migration and HTTP round trip need a dependency-installed development environment. CI has these steps configured but has not been executed in this authoring environment.
