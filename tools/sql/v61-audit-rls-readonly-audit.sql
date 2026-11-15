-- AssetTrust v0.61: read-only audit-ledger security inspection for Kali PostgreSQL.
-- Run with psql against the explicitly chosen database. No customer row contents read.
-- Does not prove tenant isolation without the separate live seeded test.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_user AS inspector_role;
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_catalog.pg_get_userbyid(c.relowner) AS owner
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
 'report_pdf_layout_proposals','report_pdf_layout_revisions','report_pdf_layout_active',
 'assets','verification_cases','case_evidence','documents','audit_events')
ORDER BY c.relname;
SELECT policyname,cmd,roles,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public' AND tablename='audit_events'
ORDER BY cmd,policyname;
SELECT filename, sha256, applied_at
FROM public.assettrust_schema_migrations
WHERE filename='026_audit_events_rls.sql';
ROLLBACK;
