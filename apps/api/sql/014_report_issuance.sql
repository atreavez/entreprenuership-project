BEGIN;
-- v0.34: Private evidence-report issuance; never an official title or registry certificate.
-- Older migration files MUST retain their original SHA-256 checksums.
CREATE UNIQUE INDEX IF NOT EXISTS report_cases_org_id_key ON verification_cases(organization_id,id);
CREATE TABLE report_issuance_proposals (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL,
 prepared_snapshot jsonb NOT NULL CHECK (jsonb_typeof(prepared_snapshot)='object'),
 snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 supersedes_report_id uuid,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REJECTED','ISSUED')),
 proposed_by uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid,
 decided_at timestamptz,
 issued_report_id uuid UNIQUE,
 CONSTRAINT report_proposal_case_org FOREIGN KEY(organization_id,case_id) REFERENCES verification_cases(organization_id,id),
 CONSTRAINT report_proposal_actor_org FOREIGN KEY(proposed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT report_proposal_reviewer_org FOREIGN KEY(decided_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT report_proposal_independent CHECK(decided_by IS NULL OR decided_by<>proposed_by),
 CONSTRAINT report_proposal_status_check CHECK (
  (status='PENDING' AND decided_by IS NULL AND decided_at IS NULL AND issued_report_id IS NULL)
  OR (status='REJECTED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND issued_report_id IS NULL)
  OR (status='ISSUED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND issued_report_id IS NOT NULL))
);
CREATE UNIQUE INDEX report_proposal_org_case_key ON report_issuance_proposals(id,organization_id,case_id);
CREATE UNIQUE INDEX report_one_pending_per_case ON report_issuance_proposals(organization_id,case_id) WHERE status='PENDING';
CREATE INDEX report_proposal_recent ON report_issuance_proposals(organization_id,proposed_at DESC);
CREATE TABLE issued_verification_reports (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL,
 proposal_id uuid NOT NULL UNIQUE,
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 supersedes_report_id uuid,
 issued_by uuid NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT report_issued_case_org FOREIGN KEY(organization_id,case_id) REFERENCES verification_cases(organization_id,id),
 CONSTRAINT report_issued_actor_org FOREIGN KEY(issued_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT report_issued_proposal_org_case FOREIGN KEY(proposal_id,organization_id,case_id) REFERENCES report_issuance_proposals(id,organization_id,case_id),
 CONSTRAINT report_issued_self_supersession CHECK (supersedes_report_id IS NULL OR supersedes_report_id<>id)
);
CREATE UNIQUE INDEX issued_reports_org_id_key ON issued_verification_reports(id,organization_id);
CREATE UNIQUE INDEX issued_reports_org_case_key ON issued_verification_reports(id,organization_id,case_id);
ALTER TABLE issued_verification_reports ADD CONSTRAINT issued_report_supersession_tenant
 FOREIGN KEY(supersedes_report_id,organization_id,case_id) REFERENCES issued_verification_reports(id,organization_id,case_id);
ALTER TABLE report_issuance_proposals ADD CONSTRAINT report_proposal_supersession_tenant
 FOREIGN KEY(supersedes_report_id,organization_id,case_id) REFERENCES issued_verification_reports(id,organization_id,case_id);
ALTER TABLE report_issuance_proposals ADD CONSTRAINT report_proposal_issued_id_fk
 FOREIGN KEY(issued_report_id,organization_id,case_id) REFERENCES issued_verification_reports(id,organization_id,case_id) DEFERRABLE INITIALLY DEFERRED;
-- Only one initial report and one direct successor per report. Supersession is append-only.
CREATE UNIQUE INDEX issued_report_one_origin ON issued_verification_reports(organization_id,case_id) WHERE supersedes_report_id IS NULL;
CREATE UNIQUE INDEX issued_report_one_successor ON issued_verification_reports(supersedes_report_id) WHERE supersedes_report_id IS NOT NULL;
CREATE INDEX issued_reports_by_case ON issued_verification_reports(organization_id,case_id,issued_at DESC);
CREATE FUNCTION assettrust_issued_report_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Issued evidence report snapshots may not be updated or deleted; create a superseding report';
END;
$$;
CREATE TRIGGER issued_report_write_once BEFORE UPDATE OR DELETE ON issued_verification_reports
 FOR EACH ROW EXECUTE FUNCTION assettrust_issued_report_no_mutation();
COMMIT;
