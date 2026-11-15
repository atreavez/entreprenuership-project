BEGIN;
-- v0.61: restrict the per-organization audit chain at PostgreSQL layer.
-- App writes/read heads MUST set assettrust.tenant_id in a transaction.
-- SELECT and INSERT are the only policies; no runtime UPDATE/DELETE policy.
-- Runtime privileges separately revoke UPDATE/DELETE on audit_events (v0.60).
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_select_v61 ON public.audit_events
 FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY audit_events_tenant_insert_v61 ON public.audit_events
 FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
COMMIT;
