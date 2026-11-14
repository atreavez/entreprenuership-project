-- AssetTrust v0.48 read-only RLS inventory. Run as a privileged auditor; does NOT prove app role behavior.
BEGIN TRANSACTION READ ONLY;
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS table_owner,
       (SELECT count(*)::integer FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('report_pdf_layout_proposals','report_pdf_layout_revisions',
                   'report_pdf_layout_active','case_evidence','assets',
                   'verification_cases','documents','users')
ORDER BY c.relname;
SELECT current_user AS audited_role, r.rolsuper, r.rolbypassrls
FROM pg_roles r WHERE r.rolname=current_user;
ROLLBACK;
