BEGIN;
-- v0.47 — fail-closed core referential tenant integrity. This is NOT blanket RLS.
-- The migration intentionally validates existing rows: abort the transaction if
-- historical references cross an organization boundary. Do not use NOT VALID,
-- disable triggers, or delete records to make migration succeed.
-- Composite UNIQUE constraints are required as PostgreSQL FK reference targets.
ALTER TABLE public.users ADD CONSTRAINT uq_users_organization_id_id_v47
  UNIQUE (organization_id, id);
ALTER TABLE public.assets ADD CONSTRAINT uq_assets_organization_id_id_v47
  UNIQUE (organization_id, id);
ALTER TABLE public.verification_cases ADD CONSTRAINT uq_cases_organization_id_id_v47
  UNIQUE (organization_id, id);
ALTER TABLE public.verification_cases ADD CONSTRAINT uq_cases_organization_id_id_asset_v47
  UNIQUE (organization_id, id, asset_id);

ALTER TABLE public.assets ADD CONSTRAINT fk_assets_creator_tenant_v47
  FOREIGN KEY (organization_id, created_by)
  REFERENCES public.users (organization_id, id);
ALTER TABLE public.verification_cases ADD CONSTRAINT fk_cases_asset_tenant_v47
  FOREIGN KEY (organization_id, asset_id)
  REFERENCES public.assets (organization_id, id);
ALTER TABLE public.verification_cases ADD CONSTRAINT fk_cases_creator_tenant_v47
  FOREIGN KEY (organization_id, created_by)
  REFERENCES public.users (organization_id, id);
ALTER TABLE public.verification_cases ADD CONSTRAINT fk_cases_assignee_tenant_v47
  FOREIGN KEY (organization_id, assigned_to)
  REFERENCES public.users (organization_id, id);
ALTER TABLE public.case_evidence ADD CONSTRAINT fk_evidence_case_tenant_v47
  FOREIGN KEY (organization_id, case_id)
  REFERENCES public.verification_cases (organization_id, id);
ALTER TABLE public.case_evidence ADD CONSTRAINT fk_evidence_recorder_tenant_v47
  FOREIGN KEY (organization_id, recorded_by)
  REFERENCES public.users (organization_id, id);
ALTER TABLE public.case_evidence ADD CONSTRAINT fk_evidence_reviewer_tenant_v47
  FOREIGN KEY (organization_id, reviewed_by)
  REFERENCES public.users (organization_id, id);
ALTER TABLE public.documents ADD CONSTRAINT fk_documents_asset_tenant_v47
  FOREIGN KEY (organization_id, asset_id)
  REFERENCES public.assets (organization_id, id);
ALTER TABLE public.documents ADD CONSTRAINT fk_documents_case_tenant_v47
  FOREIGN KEY (organization_id, case_id)
  REFERENCES public.verification_cases (organization_id, id);
ALTER TABLE public.documents ADD CONSTRAINT fk_documents_uploader_tenant_v47
  FOREIGN KEY (organization_id, uploaded_by)
  REFERENCES public.users (organization_id, id);
ALTER TABLE public.documents ADD CONSTRAINT fk_documents_case_asset_consistency_v47
  FOREIGN KEY (organization_id, case_id, asset_id)
  REFERENCES public.verification_cases (organization_id, id, asset_id);

-- Same-tenant relationship checks prevent a record from linking to an asset,
-- case, creator, assignee, uploader, recorder, or reviewer in another tenant.
-- A document linked to both an asset and a case must name that case's asset.
-- They do NOT prevent a raw SELECT from reading rows of another tenant.
-- RLS must be extended separately after every access path is tenant-scoped.
COMMIT;
