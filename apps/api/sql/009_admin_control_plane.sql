BEGIN;
-- v0.28 append-only platform/tenant configuration history. No changes to audit history, titles, documents, or legal evidence.
CREATE TABLE IF NOT EXISTS platform_admin_appointments (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 granted_by uuid REFERENCES users(id),
 grant_source text NOT NULL CHECK (grant_source IN ('OPERATOR_BOOTSTRAP','PLATFORM_ADMIN')),
 granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS admin_configuration_values (
 scope text NOT NULL CHECK(scope IN ('platform','organization')),
 scope_id uuid NOT NULL,
 setting_key varchar(100) NOT NULL,
 value jsonb NOT NULL,
 version integer NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,scope_id,setting_key),
 CONSTRAINT platform_scope_id CHECK(scope<>'platform' OR scope_id='00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE TABLE IF NOT EXISTS admin_configuration_changes (
 id uuid PRIMARY KEY,
 scope text NOT NULL CHECK(scope IN ('platform','organization')),
 scope_id uuid NOT NULL,
 setting_key varchar(100) NOT NULL,
 proposed_value jsonb NOT NULL,
 expected_version integer NOT NULL CHECK(expected_version>=0),
 status text NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 submitted_by uuid NOT NULL REFERENCES users(id),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 CONSTRAINT valid_review_status CHECK ((status='PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
   OR (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CONSTRAINT proposal_platform_scope_id CHECK(scope<>'platform' OR scope_id='00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_one_pending_per_setting
 ON admin_configuration_changes(scope,scope_id,setting_key) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS admin_changes_scope_timeline ON admin_configuration_changes(scope,scope_id,submitted_at DESC);
COMMIT;
