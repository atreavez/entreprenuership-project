BEGIN;
-- Stage evidence is submitted first and must receive a separately attributable decision.
ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'SUBMITTED'
 CHECK (review_status IN ('SUBMITTED','ACCEPTED','REJECTED'));
ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id);
ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE case_evidence ADD COLUMN IF NOT EXISTS review_notes text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_evidence_stage_review ON case_evidence(organization_id,case_id,stage,evidence_type,review_status);
INSERT INTO schema_migrations(version) VALUES ('003_evidence_review') ON CONFLICT DO NOTHING;
COMMIT;
