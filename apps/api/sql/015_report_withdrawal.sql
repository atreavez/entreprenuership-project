BEGIN;
-- v0.35: Two-person withdrawal of previously issued PRIVATE evidence reports.
-- Issued snapshots remain append-only. Withdrawal is a distinct append-only fact.
CREATE TABLE report_withdrawal_proposals (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 report_id uuid NOT NULL,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 20 AND 1000),
 proposed_by uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REJECTED','APPROVED')),
 decided_by uuid,
 decided_at timestamptz,
 withdrawal_id uuid UNIQUE,
 CONSTRAINT withdrawal_proposal_report_org FOREIGN KEY(report_id,organization_id)
  REFERENCES issued_verification_reports(id,organization_id),
 CONSTRAINT withdrawal_proposal_actor_org FOREIGN KEY(proposed_by,organization_id)
  REFERENCES users(id,organization_id),
 CONSTRAINT withdrawal_proposal_reviewer_org FOREIGN KEY(decided_by,organization_id)
  REFERENCES users(id,organization_id),
 CONSTRAINT withdrawal_proposal_independent CHECK(decided_by IS NULL OR decided_by<>proposed_by),
 CONSTRAINT withdrawal_proposal_terminal CHECK (
  (status='PENDING' AND decided_by IS NULL AND decided_at IS NULL AND withdrawal_id IS NULL)
  OR (status='REJECTED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND withdrawal_id IS NULL)
  OR (status='APPROVED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND withdrawal_id IS NOT NULL))
);
CREATE UNIQUE INDEX withdrawal_proposal_org_report_key ON report_withdrawal_proposals(id,organization_id,report_id);
CREATE UNIQUE INDEX withdrawal_one_pending_per_report ON report_withdrawal_proposals(organization_id,report_id) WHERE status='PENDING';
CREATE INDEX withdrawal_proposal_recent ON report_withdrawal_proposals(organization_id,proposed_at DESC);
CREATE TABLE issued_report_withdrawals (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 report_id uuid NOT NULL,
 proposal_id uuid NOT NULL UNIQUE,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 20 AND 1000),
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT withdrawal_report_org FOREIGN KEY(report_id,organization_id)
  REFERENCES issued_verification_reports(id,organization_id),
 CONSTRAINT withdrawal_proposal_same_report FOREIGN KEY(proposal_id,organization_id,report_id)
  REFERENCES report_withdrawal_proposals(id,organization_id,report_id),
 CONSTRAINT withdrawal_approver_org FOREIGN KEY(approved_by,organization_id)
  REFERENCES users(id,organization_id),
 CONSTRAINT withdrawal_one_per_report UNIQUE(report_id)
);
CREATE UNIQUE INDEX withdrawn_report_org_key ON issued_report_withdrawals(id,organization_id,report_id);
ALTER TABLE report_withdrawal_proposals ADD CONSTRAINT withdrawal_proposal_approved_id_fk
 FOREIGN KEY(withdrawal_id,organization_id,report_id)
 REFERENCES issued_report_withdrawals(id,organization_id,report_id) DEFERRABLE INITIALLY DEFERRED;
-- Reject replayed decisions / any alteration of proposal's original author/reason/report.
CREATE FUNCTION assettrust_withdrawal_proposal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'PENDING' OR NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id
   OR NEW.report_id <> OLD.report_id OR NEW.proposed_by <> OLD.proposed_by
   OR NEW.reason <> OLD.reason OR NEW.proposed_at <> OLD.proposed_at THEN
  RAISE EXCEPTION 'Withdrawal proposal is immutable except its first independent decision';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER withdrawal_proposal_one_decision BEFORE UPDATE ON report_withdrawal_proposals
 FOR EACH ROW EXECUTE FUNCTION assettrust_withdrawal_proposal_guard();
CREATE FUNCTION assettrust_withdrawal_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Approved evidence report withdrawals cannot be altered or deleted';
END;
$$;
CREATE TRIGGER withdrawal_write_once BEFORE UPDATE OR DELETE ON issued_report_withdrawals
 FOR EACH ROW EXECUTE FUNCTION assettrust_withdrawal_no_mutation();
COMMIT;
