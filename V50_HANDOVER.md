# AssetTrust v0.50 - Confidential Document Metadata RLS

**Release verdict: NO-GO - development checkpoint only.** 11 November 2026.

## Changed files

- `apps/api/sql/025_documents_rls.sql` - new immutable SQL migration.
- `apps/api/src/contexts/platform/domain/schema-manifest.ts` - append SHA-256 only.
- `apps/api/src/database.ts` - guard document RLS on production startup.
- `apps/api/src/professional-trust.ts` - scope supporting-file lookup transaction.
- `package.json`, `apps/api/package.json`, `apps/web/package.json` and `.github/workflows/ci.yml` - version 0.50, complete CI and guarded PG contract.
- `tools/tests-v50/document-rls.test.cjs`, `tools/e2e-pg-documents-rls-v50.mjs`, `tools/sql/v50-documents-rls-readonly-audit.sql` - tests and operator checks.
- Historical fixture-only changes: `tools/tests-v22/professional-session-expiry.test.cjs`, `tools/tests-v46/layout-rls.test.cjs`, `tools/tests-v48/evidence-rls.test.cjs`, `tools/tests-v49/assets-cases-rls.test.cjs`.

## Compatibility

Before applying migration 025, stop or upgrade all API instances that access `documents`. Older API versions may fail to set tenant scope during professional-accreditation submission, so mixing old and new instances can cause denied reads. The SQL migration is additive and its policies must not be changed after application. Rollback of source is not equivalent to reversing a production migration.

## Operator review

Review v0.49 prior deployment evidence, verify a restorable backup, preserve document-encryption keys and signing keys, validate existing tenant relationships, and use `V50_KALI_VALIDATION.md` for the safe test sequence. No production credentials, `.env`, or release approval are bundled.
