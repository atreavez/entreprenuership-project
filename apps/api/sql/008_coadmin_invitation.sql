BEGIN;
-- v0.27 privileged onboarding, append-only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_mfa_required boolean NOT NULL DEFAULT false;
ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES users(id);
ALTER TABLE team_invitations DROP CONSTRAINT IF EXISTS team_invitations_role_check;
ALTER TABLE team_invitations ADD CONSTRAINT team_invitations_role_check
 CHECK (role IN ('ORG_ADMIN','CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER'));
CREATE INDEX IF NOT EXISTS team_invitations_pending_admin_idx
 ON team_invitations(organization_id,email,expires_at)
 WHERE role='ORG_ADMIN' AND accepted_at IS NULL AND revoked_at IS NULL;
COMMIT;
