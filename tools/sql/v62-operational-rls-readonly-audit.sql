-- v0.62 READ-ONLY Postgres RLS inspection. Does not prove live access isolation.
BEGIN READ ONLY;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls,
 pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('case_tasks','disputes','monitoring_reminders','verification_quotes','notifications')
ORDER BY c.relname;
SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('case_tasks','disputes','monitoring_reminders','verification_quotes','notifications')
ORDER BY tablename,policyname;
COMMIT;
