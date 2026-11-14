BEGIN;
-- v0.29 adds tenant-scoped member lifecycle without rewriting previous migrations.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason text;
CREATE INDEX IF NOT EXISTS users_active_org_idx ON users(organization_id,created_at DESC) WHERE suspended_at IS NULL;
-- Cross-tenant proposal references are blocked at the database layer as well.
CREATE UNIQUE INDEX IF NOT EXISTS users_id_org_v29_idx ON users(id,organization_id);
CREATE TABLE IF NOT EXISTS member_role_proposals (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 target_user_id uuid NOT NULL,
 expected_role text NOT NULL CHECK (expected_role IN ('CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER')),
 proposed_role text NOT NULL CHECK (proposed_role IN ('CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER')),
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
 proposed_by uuid NOT NULL,
 decided_by uuid,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CONSTRAINT member_proposal_target_tenant FOREIGN KEY(target_user_id,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT member_proposal_proposer_tenant FOREIGN KEY(proposed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT member_proposal_decider_tenant FOREIGN KEY(decided_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT member_role_really_changes CHECK (expected_role<>proposed_role),
 CONSTRAINT member_proposal_decision_state CHECK (
  (status='PENDING' AND decided_by IS NULL AND decided_at IS NULL) OR
  (status<>'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS member_one_pending_role_change
 ON member_role_proposals(organization_id,target_user_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS member_proposal_org_history
 ON member_role_proposals(organization_id,proposed_at DESC);
COMMIT;
