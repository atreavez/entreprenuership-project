BEGIN;
-- Expansion from starter schema. Run once after 001_init.sql.
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS team_invitations (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 email text NOT NULL, role text NOT NULL CHECK(role IN ('CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER')),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 accepted_at timestamptz, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_org ON team_invitations(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS case_tasks (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL REFERENCES verification_cases(id),
 title text NOT NULL, description text NOT NULL DEFAULT '', assignee_id uuid REFERENCES users(id),
 due_at timestamptz, status text NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO','IN_PROGRESS','DONE','CANCELLED')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON case_tasks(organization_id,case_id,created_at DESC);
CREATE TABLE IF NOT EXISTS disputes (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL REFERENCES verification_cases(id),
 category text NOT NULL CHECK(category IN ('IDENTITY','DOCUMENT','BOUNDARY','OWNERSHIP_CLAIM','REGISTRY_CONFLICT','OTHER')),
 description text NOT NULL, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED','REJECTED')),
 resolution text, reported_by uuid NOT NULL REFERENCES users(id), assigned_to uuid REFERENCES users(id),
 resolved_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disputes_tenant ON disputes(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), recipient_id uuid NOT NULL REFERENCES users(id),
 category text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '',
 resource_type text, resource_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(organization_id,recipient_id,created_at DESC);
CREATE TABLE IF NOT EXISTS monitoring_reminders (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 asset_id uuid NOT NULL REFERENCES assets(id), label text NOT NULL, due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON monitoring_reminders(organization_id,due_at);
CREATE TABLE IF NOT EXISTS verification_quotes (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL REFERENCES verification_cases(id), amount_ugx bigint NOT NULL CHECK(amount_ugx>=0),
 scope text NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ISSUED','ACCEPTED','DECLINED','VOID')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON verification_quotes(organization_id,created_at DESC);
-- Access grants share only within the organization, not with strangers, and expire on schedule.
CREATE TABLE IF NOT EXISTS resource_grants (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 asset_id uuid NOT NULL REFERENCES assets(id), grantee_id uuid NOT NULL REFERENCES users(id),
 permission text NOT NULL CHECK(permission IN ('READ','CONTRIBUTE')),
 expires_at timestamptz NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,asset_id,grantee_id)
);
CREATE INDEX IF NOT EXISTS idx_grants_access ON resource_grants(organization_id,grantee_id,asset_id);
INSERT INTO schema_migrations(version) VALUES ('002_operations') ON CONFLICT DO NOTHING;
COMMIT;
