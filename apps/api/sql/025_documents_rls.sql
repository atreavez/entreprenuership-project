BEGIN;
-- v0.50: protect private document metadata using transaction-local organization context.
-- Document bytes remain encrypted in private blob storage. This policy is not a substitute
-- for the case/asset contribution authorization checks in the application.
-- Operators must verify integrity and staging before a production rollout.
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant_v50 ON public.documents
 FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
COMMIT;
