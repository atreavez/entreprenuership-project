-- AssetTrust v0.50: read-only RLS inventory, not a substitute for role-based integration tests.
BEGIN TRANSACTION READ ONLY;
WITH expected(tablename, protected) AS (
 VALUES ('report_pdf_layout_proposals',true),('report_pdf_layout_revisions',true),
        ('report_pdf_layout_active',true),('case_evidence',true),
        ('assets',true),('verification_cases',true),('documents',true),
        ('users',false),('audit_events',false)
)
SELECT expected.tablename, expected.protected AS expected_rls,
       cls.relrowsecurity AS rls_enabled, cls.relforcerowsecurity AS force_rls,
       pg_get_userbyid(cls.relowner) AS table_owner,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=expected.tablename) AS policies
FROM expected LEFT JOIN pg_class cls ON cls.oid=to_regclass('public.'||expected.tablename)
ORDER BY expected.tablename;
SELECT current_user AS runtime_role, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
FROM pg_roles WHERE rolname=current_user;
SELECT filename,sha256 FROM assettrust_schema_migrations
WHERE filename IN ('021_pdf_layout_rls.sql','023_case_evidence_rls.sql',
 '024_assets_and_cases_rls.sql','025_documents_rls.sql') ORDER BY filename;
ROLLBACK;
