BEGIN;
-- v0.48: bounded RLS rollout for PRIVATE case evidence. Do not change existing migrations.
-- Organization scope is set only with set_config(..., true) inside a transaction.
-- This policy is tenant isolation, NOT an authorization substitute for assigned-case rules.
-- No wildcard for platform admins; they use separate audited delegated scopes.
ALTER TABLE public.case_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY case_evidence_tenant_v48 ON public.case_evidence
  FOR ALL TO PUBLIC
  USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
COMMIT;
