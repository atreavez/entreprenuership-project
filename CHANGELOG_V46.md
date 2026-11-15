# AssetTrust v0.46 changelog

**Date:** 11 November 2026

## Implemented
- Additive PostgreSQL migration `021_pdf_layout_rls.sql` with FORCE RLS policies for `report_pdf_layout_proposals`, `report_pdf_layout_revisions`, and `report_pdf_layout_active`.
- Custom transaction-local tenant context `set_config('assettrust.tenant_id',$1,true)`, validated as a canonical organization UUID; it is scoped to the transaction, not the pooled session.
- All four administrator PDF-layout workflows set context after fresh MFA step-up.
- Recipient redemption applies the matched share's organization context before reading private layout data.
- Production database startup safety gate requires a separate unprivileged runtime role and deployed RLS policies.
- Guarded real PostgreSQL contract tests, 13 new offline tests, and CI coverage.

## Explicit limitations
- Other sensitive tables (users, documents, cases, report data, finance and more) are NOT covered by new database RLS policies yet.
- A custom PostgreSQL session setting cannot protect against an adversary who already has arbitrary SQL execution or database administrator privileges; least-privilege credentials, parameterized queries, and DB network security remain required.
- Live PostgreSQL contract and production database role checks are not executed here.
- No dependency install, full build, authenticated browser test, production configuration, Git-history scan, or malware scanning proof.
- Previous schema migrations have not been modified; any applied migration must retain its exact SHA-256.

**Release decision: NO-GO.**
