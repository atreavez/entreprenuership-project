BEGIN;
-- Organization-scoped, versioned workflow tightening. Mandatory stages, legal disclaimers and independent review are immutable in code.
CREATE TABLE workflow_stage_policies (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 stage text NOT NULL CHECK(stage IN ('INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW')),
 target_days integer NOT NULL CHECK(target_days BETWEEN 1 AND 365),
 reminder_days integer NOT NULL CHECK(reminder_days >= 0 AND reminder_days < target_days),
 additional_evidence_type text CHECK(additional_evidence_type IN ('IDENTITY','DOCUMENT','REGISTRY_SEARCH','FIELD_REPORT','LEGAL_OPINION','DECISION')),
 version integer NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,stage),
 CONSTRAINT workflow_setting_author_tenant FOREIGN KEY(updated_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT workflow_extra_not_mandatory CHECK(additional_evidence_type IS NULL OR additional_evidence_type<>CASE stage
   WHEN 'INTAKE' THEN 'IDENTITY' WHEN 'DOCUMENT_REVIEW' THEN 'DOCUMENT' WHEN 'REGISTRY_SEARCH' THEN 'REGISTRY_SEARCH'
   WHEN 'FIELD_INSPECTION' THEN 'FIELD_REPORT' WHEN 'LEGAL_REVIEW' THEN 'LEGAL_OPINION' WHEN 'FINAL_REVIEW' THEN 'DECISION' END)
);
CREATE TABLE workflow_stage_policy_changes (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 stage text NOT NULL CHECK(stage IN ('INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW')),
 target_days integer NOT NULL CHECK(target_days BETWEEN 1 AND 365),
 reminder_days integer NOT NULL CHECK(reminder_days>=0 AND reminder_days<target_days),
 additional_evidence_type text CHECK(additional_evidence_type IN ('IDENTITY','DOCUMENT','REGISTRY_SEARCH','FIELD_REPORT','LEGAL_OPINION','DECISION')),
 expected_version integer NOT NULL CHECK(expected_version>=0),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 12 AND 500),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 proposed_by uuid NOT NULL,
 decided_by uuid,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CONSTRAINT workflow_change_proposer_tenant FOREIGN KEY(proposed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT workflow_change_decider_tenant FOREIGN KEY(decided_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT workflow_separate_approver CHECK(decided_by IS NULL OR proposed_by<>decided_by),
 CONSTRAINT workflow_proposal_state CHECK((status='PENDING' AND decided_by IS NULL AND decided_at IS NULL)
   OR (status IN ('APPROVED','REJECTED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),
 CONSTRAINT workflow_extra_not_mandatory CHECK(additional_evidence_type IS NULL OR additional_evidence_type<>CASE stage
   WHEN 'INTAKE' THEN 'IDENTITY' WHEN 'DOCUMENT_REVIEW' THEN 'DOCUMENT' WHEN 'REGISTRY_SEARCH' THEN 'REGISTRY_SEARCH'
   WHEN 'FIELD_INSPECTION' THEN 'FIELD_REPORT' WHEN 'LEGAL_REVIEW' THEN 'LEGAL_OPINION' WHEN 'FINAL_REVIEW' THEN 'DECISION' END)
);
CREATE UNIQUE INDEX workflow_one_pending_change_per_stage ON workflow_stage_policy_changes(organization_id,stage) WHERE status='PENDING';
CREATE INDEX workflow_policy_change_timeline ON workflow_stage_policy_changes(organization_id,proposed_at DESC);
COMMIT;
