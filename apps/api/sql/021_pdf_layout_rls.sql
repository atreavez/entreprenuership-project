BEGIN;
-- v0.46: first bounded database RLS rollout. PRIVATE PDF-layout administration only.
-- FORCE prevents ordinary table owners from bypassing RLS. Superusers and
-- BYPASSRLS roles still bypass: production application role must be neither.
-- The app must set assettrust.tenant_id transaction-locally before accessing these tables.
-- A missing context intentionally returns zero rows; no global admin wildcard.
ALTER TABLE public.report_pdf_layout_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_pdf_layout_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY report_pdf_layout_proposals_tenant_v46 ON public.report_pdf_layout_proposals
 FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid);
ALTER TABLE public.report_pdf_layout_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_pdf_layout_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY report_pdf_layout_revisions_tenant_v46 ON public.report_pdf_layout_revisions
 FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid);
ALTER TABLE public.report_pdf_layout_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_pdf_layout_active FORCE ROW LEVEL SECURITY;
CREATE POLICY report_pdf_layout_active_tenant_v46 ON public.report_pdf_layout_active
 FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true),'')::uuid);
COMMIT;
