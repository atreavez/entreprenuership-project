BEGIN;
-- v0.62: operational records and recipient inboxes, database-enforced.
-- This migration intentionally FAILS when existing rows contain cross-org foreign keys.
-- Run only after backup, real staging checks, and a coordinated API upgrade.
-- Parent targets (organization_id,id) were made unique by migration 022.
ALTER TABLE public.case_tasks ADD CONSTRAINT fk_tasks_case_tenant_v62
  FOREIGN KEY (organization_id,case_id) REFERENCES public.verification_cases(organization_id,id);
ALTER TABLE public.case_tasks ADD CONSTRAINT fk_tasks_creator_tenant_v62
  FOREIGN KEY (organization_id,created_by) REFERENCES public.users(organization_id,id);
ALTER TABLE public.case_tasks ADD CONSTRAINT fk_tasks_assignee_tenant_v62
  FOREIGN KEY (organization_id,assignee_id) REFERENCES public.users(organization_id,id);
ALTER TABLE public.disputes ADD CONSTRAINT fk_disputes_case_tenant_v62
  FOREIGN KEY (organization_id,case_id) REFERENCES public.verification_cases(organization_id,id);
ALTER TABLE public.disputes ADD CONSTRAINT fk_disputes_reporter_tenant_v62
  FOREIGN KEY (organization_id,reported_by) REFERENCES public.users(organization_id,id);
ALTER TABLE public.disputes ADD CONSTRAINT fk_disputes_assignee_tenant_v62
  FOREIGN KEY (organization_id,assigned_to) REFERENCES public.users(organization_id,id);
ALTER TABLE public.disputes ADD CONSTRAINT fk_disputes_resolver_tenant_v62
  FOREIGN KEY (organization_id,resolved_by) REFERENCES public.users(organization_id,id);
ALTER TABLE public.monitoring_reminders ADD CONSTRAINT fk_reminders_asset_tenant_v62
  FOREIGN KEY (organization_id,asset_id) REFERENCES public.assets(organization_id,id);
ALTER TABLE public.monitoring_reminders ADD CONSTRAINT fk_reminders_creator_tenant_v62
  FOREIGN KEY (organization_id,created_by) REFERENCES public.users(organization_id,id);
ALTER TABLE public.verification_quotes ADD CONSTRAINT fk_quotes_case_tenant_v62
  FOREIGN KEY (organization_id,case_id) REFERENCES public.verification_cases(organization_id,id);
ALTER TABLE public.verification_quotes ADD CONSTRAINT fk_quotes_creator_tenant_v62
  FOREIGN KEY (organization_id,created_by) REFERENCES public.users(organization_id,id);
ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_recipient_tenant_v62
  FOREIGN KEY (organization_id,recipient_id) REFERENCES public.users(organization_id,id);

-- Tenant-scoped operational data. Missing transaction-local tenant scope hides rows.
ALTER TABLE public.case_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY case_tasks_tenant_v62 ON public.case_tasks FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid);
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes FORCE ROW LEVEL SECURITY;
CREATE POLICY disputes_tenant_v62 ON public.disputes FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid);
ALTER TABLE public.monitoring_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_reminders FORCE ROW LEVEL SECURITY;
CREATE POLICY monitoring_reminders_tenant_v62 ON public.monitoring_reminders FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid);
ALTER TABLE public.verification_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY verification_quotes_tenant_v62 ON public.verification_quotes FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid);
-- Inbox SELECT and UPDATE require BOTH tenant and authenticated recipient.
-- Other staff can create correctly scoped notifications but cannot read them.
-- No runtime DELETE policy is installed.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_recipient_select_v62 ON public.notifications FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid
        AND recipient_id = NULLIF(current_setting('assettrust.actor_id',true),'')::uuid);
CREATE POLICY notifications_recipient_update_v62 ON public.notifications FOR UPDATE TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid
        AND recipient_id = NULLIF(current_setting('assettrust.actor_id',true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid
        AND recipient_id = NULLIF(current_setting('assettrust.actor_id',true),'')::uuid);
CREATE POLICY notifications_tenant_insert_v62 ON public.notifications FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id',true),'')::uuid);
COMMIT;
