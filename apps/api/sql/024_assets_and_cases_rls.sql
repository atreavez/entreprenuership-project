BEGIN;
-- v0.49: RLS on organization-private assets and verification cases.
-- Requires all application access paths to set tenant scope in a transaction.
-- Do not allow privileged runtime roles (superuser/BYPASSRLS/table owner).
-- Published public report status derives tenant scope from an unguessable report UUID.
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets FORCE ROW LEVEL SECURITY;
CREATE POLICY assets_tenant_v49 ON public.assets
 FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.verification_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY verification_cases_tenant_v49 ON public.verification_cases
 FOR ALL TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
COMMIT;
