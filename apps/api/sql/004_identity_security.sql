BEGIN;
-- v0.5 identity bounded context: persistent session rotation, MFA, and one-time challenges.
CREATE TABLE IF NOT EXISTS auth_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 refresh_hash char(64) NOT NULL, device varchar(160) NOT NULL DEFAULT 'Unknown device',
 created_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,absolute_expires_at timestamptz NOT NULL,
 revoked_at timestamptz,revocation_reason text
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS auth_mfa_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 secret_ciphertext text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 last_used_step bigint NOT NULL DEFAULT -1,
 enrolled_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz
);
CREATE TABLE IF NOT EXISTS auth_login_challenges (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 challenge_hash char(64) NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_challenges_user_idx ON auth_login_challenges(user_id,expires_at);
-- One-time hashed MFA backup codes, never reveal these again after initial issuance.
CREATE TABLE IF NOT EXISTS auth_recovery_codes (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 code_hash char(64) NOT NULL UNIQUE,consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_recovery_user_idx ON auth_recovery_codes(user_id);
COMMIT;
