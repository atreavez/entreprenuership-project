BEGIN;
-- v0.38. Organization-scoped presentation (branding) only. Never rewrite issued evidence.
-- Two administrators approve a revision. Every approved version remains append-only.
CREATE TABLE report_pdf_layout_proposals (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 proposed_layout jsonb NOT NULL CHECK(jsonb_typeof(proposed_layout)='object'),
 expected_revision integer NOT NULL CHECK(expected_revision>=0),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 12 AND 500),
 proposed_by uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 decided_by uuid,
 decided_at timestamptz,
 CONSTRAINT pdf_layout_proposer_fk FOREIGN KEY(proposed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT pdf_layout_decider_fk FOREIGN KEY(decided_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT pdf_layout_independence CHECK(decided_by IS NULL OR decided_by<>proposed_by),
 CONSTRAINT pdf_layout_terminal CHECK(
   (status='PENDING' AND decided_by IS NULL AND decided_at IS NULL)
   OR (status IN ('APPROVED','REJECTED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX report_pdf_layout_one_pending ON report_pdf_layout_proposals(organization_id) WHERE status='PENDING';
CREATE INDEX report_pdf_layout_proposals_recent ON report_pdf_layout_proposals(organization_id,proposed_at DESC);
CREATE UNIQUE INDEX report_pdf_layout_proposal_org ON report_pdf_layout_proposals(id,organization_id);
CREATE TABLE report_pdf_layout_revisions (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 revision integer NOT NULL CHECK(revision>0),
 layout jsonb NOT NULL CHECK(jsonb_typeof(layout)='object'),
 proposal_id uuid NOT NULL UNIQUE,
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,revision),
 CONSTRAINT pdf_layout_revision_proposal FOREIGN KEY(proposal_id,organization_id) REFERENCES report_pdf_layout_proposals(id,organization_id),
 CONSTRAINT pdf_layout_revision_approver FOREIGN KEY(approved_by,organization_id) REFERENCES users(id,organization_id)
);
CREATE TABLE report_pdf_layout_active (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 revision integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pdf_layout_active_revision FOREIGN KEY(organization_id,revision) REFERENCES report_pdf_layout_revisions(organization_id,revision)
);
CREATE FUNCTION assettrust_pdf_layout_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Approved PDF layout history is immutable; propose a new revision';
END; $$;
CREATE TRIGGER pdf_layout_revision_write_once BEFORE UPDATE OR DELETE ON report_pdf_layout_revisions
 FOR EACH ROW EXECUTE FUNCTION assettrust_pdf_layout_no_mutation();
CREATE FUNCTION assettrust_pdf_layout_active_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.organization_id<>OLD.organization_id OR NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'Active report layout must advance by one approved revision';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER pdf_layout_active_advance BEFORE UPDATE ON report_pdf_layout_active
 FOR EACH ROW EXECUTE FUNCTION assettrust_pdf_layout_active_guard();
CREATE FUNCTION assettrust_pdf_layout_proposal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'PENDING' OR NEW.status='PENDING' OR NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id
  OR NEW.proposed_layout<>OLD.proposed_layout OR NEW.expected_revision<>OLD.expected_revision
  OR NEW.reason<>OLD.reason OR NEW.proposed_by<>OLD.proposed_by OR NEW.proposed_at<>OLD.proposed_at THEN
   RAISE EXCEPTION 'PDF layout proposals can only receive their first decision';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER pdf_layout_one_decision BEFORE UPDATE ON report_pdf_layout_proposals
 FOR EACH ROW EXECUTE FUNCTION assettrust_pdf_layout_proposal_guard();
COMMIT;
