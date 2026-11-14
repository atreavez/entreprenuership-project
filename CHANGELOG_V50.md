# AssetTrust v0.50 - Confidential Document Metadata RLS

**Release verdict: NO-GO - development checkpoint only.** 11 November 2026.

## Implementation

- Append-only migration `025_documents_rls.sql`: `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` for `public.documents`, with a `FOR ALL` tenant policy that denies access without a transaction-local organization UUID. Existing migrations are unchanged.
- Production application startup now refuses to run unless **all seven protected relations**, including `documents`, report enabled/forced RLS, and the runtime database role is neither privileged nor their owner.
- The professional accreditation application now establishes a validated tenant scope inside the database transaction **before** checking that a supporting document belongs to the user/organization. Other document list/upload/download and dashboard access paths were already scoped and are retained.
- CI registers the v0.50 offline tests and the explicitly authorized disposable PostgreSQL document-RLS contract. The contract uses two synthetic organizations, a non-bypass role, denied cross-organization reads/updates/deletes/inserts, and transaction rollback.
- New read-only RLS inventory script: `tools/sql/v50-documents-rls-readonly-audit.sql`.
- Existing v0.22, v0.46, v0.48 and v0.49 test fixtures were reconciled for the new dependency/table inventory while preserving their original security checks.

## Boundaries

- This migration protects **document metadata rows** at PostgreSQL level; encrypted blob-file storage is a separate access-control layer. RLS itself does not detect malware or prove that a document is legitimate.
- Seven tables are named in the source RLS startup inventory: three PDF-layout tables, `case_evidence`, `assets`, `verification_cases`, and `documents`. Other sensitive tables including `users`, `audit_events` and many operational tables do not yet have verified RLS.
- Tenant settings (`assettrust.tenant_id`) are not cryptographic identities. Application permissions, parameterized SQL, least-privilege DB roles, and network controls remain mandatory.
- No database migration or end-to-end live test has run in the artifact-generation environment.
