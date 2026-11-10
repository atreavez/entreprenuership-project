BEGIN;
-- Trust review actions require a recent MFA step-up within the same live session.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
-- Professional competence cannot be inferred from login, job title, or uploaded claims.
-- Platform reviewer appointments are out-of-band DBA-controlled; NO endpoint can grant them.
CREATE TABLE IF NOT EXISTS platform_trust_reviewers (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 appointment_reference text NOT NULL CHECK(length(appointment_reference)>=12),
 appointed_by_operator text NOT NULL DEFAULT 'MANUAL_REVIEW_REQUIRED',
 appointed_at timestamptz NOT NULL DEFAULT now(),
 disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS professional_applications (
 id uuid PRIMARY KEY,
 applicant_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 professional_role text NOT NULL CHECK (professional_role IN ('SURVEYOR','LEGAL_REVIEWER')),
 regulator_name text NOT NULL,
 licence_reference text NOT NULL,
 jurisdiction text NOT NULL DEFAULT 'Uganda',
 licence_expires_at timestamptz NOT NULL,
 supporting_document_id uuid REFERENCES documents(id),
 explanation text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','EXPIRED')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CONSTRAINT professional_licence_later CHECK(licence_expires_at > submitted_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_professional_application ON professional_applications(applicant_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS professional_pending_queue ON professional_applications(status,submitted_at);
CREATE INDEX IF NOT EXISTS professional_applicant_idx ON professional_applications(applicant_id,submitted_at DESC);
CREATE TABLE IF NOT EXISTS professional_review_decisions (
 id uuid PRIMARY KEY,
 application_id uuid NOT NULL REFERENCES professional_applications(id),
 reviewer_id uuid NOT NULL REFERENCES users(id),
 decision text NOT NULL CHECK(decision IN ('VERIFIED','REJECTED')),
 verification_method text NOT NULL,
 verification_reference text NOT NULL,
 reviewer_notes text NOT NULL,
 decided_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(application_id,reviewer_id)
);
CREATE INDEX IF NOT EXISTS professional_review_decisions_app_idx ON professional_review_decisions(application_id);
CREATE TABLE IF NOT EXISTS professional_accreditations (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 application_id uuid NOT NULL REFERENCES professional_applications(id),
 professional_role text NOT NULL CHECK (professional_role IN ('SURVEYOR','LEGAL_REVIEWER')),
 expires_at timestamptz NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revocation_reason text
);
CREATE INDEX IF NOT EXISTS professional_accreditations_active_idx ON professional_accreditations(expires_at) WHERE revoked_at IS NULL;
-- Legacy flag is denormalized for compatibility but runtime authority comes from this table.
UPDATE users SET professional_approved=false WHERE professional_approved=true
 AND NOT EXISTS (SELECT 1 FROM professional_accreditations p WHERE p.user_id=users.id AND p.revoked_at IS NULL AND p.expires_at>now() AND p.professional_role=users.role);
COMMIT;
