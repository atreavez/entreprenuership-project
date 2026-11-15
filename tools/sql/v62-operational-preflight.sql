-- v0.62 READ-ONLY historical-data integrity preflight.
-- Run as a restricted/read-only operator on an up-to-date staging RESTORE before migration 027.
-- Any nonzero violations: STOP, investigate; never auto-delete or disable FK validation.
BEGIN READ ONLY;
SELECT relationship, violating_rows FROM (
 SELECT 'case_tasks.case_id' relationship,count(*)::bigint violating_rows FROM public.case_tasks x WHERE NOT EXISTS(SELECT 1 FROM public.verification_cases p WHERE p.id=x.case_id AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'case_tasks.created_by',count(*) FROM public.case_tasks x WHERE NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.created_by AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'case_tasks.assignee_id',count(*) FROM public.case_tasks x WHERE x.assignee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.assignee_id AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'disputes.case_id',count(*) FROM public.disputes x WHERE NOT EXISTS(SELECT 1 FROM public.verification_cases p WHERE p.id=x.case_id AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'disputes.reported_by',count(*) FROM public.disputes x WHERE NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.reported_by AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'disputes.assigned_to',count(*) FROM public.disputes x WHERE x.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.assigned_to AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'disputes.resolved_by',count(*) FROM public.disputes x WHERE x.resolved_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.resolved_by AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'monitoring_reminders.asset_id',count(*) FROM public.monitoring_reminders x WHERE NOT EXISTS(SELECT 1 FROM public.assets p WHERE p.id=x.asset_id AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'monitoring_reminders.created_by',count(*) FROM public.monitoring_reminders x WHERE NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.created_by AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'verification_quotes.case_id',count(*) FROM public.verification_quotes x WHERE NOT EXISTS(SELECT 1 FROM public.verification_cases p WHERE p.id=x.case_id AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'verification_quotes.created_by',count(*) FROM public.verification_quotes x WHERE NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.created_by AND p.organization_id=x.organization_id)
 UNION ALL SELECT 'notifications.recipient_id',count(*) FROM public.notifications x WHERE NOT EXISTS(SELECT 1 FROM public.users p WHERE p.id=x.recipient_id AND p.organization_id=x.organization_id)
) relationships ORDER BY relationship;
COMMIT;
