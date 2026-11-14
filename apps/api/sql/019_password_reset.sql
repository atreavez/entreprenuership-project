BEGIN;
-- v0.44: one-time, 15-minute reset tokens. Never store a reset credential in plaintext.
-- The access token itself is delivered only via an explicitly configured server-side HTTPS relay.
CREATE TABLE auth_password_reset_requests (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash char(64) NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 delivery_state text NOT NULL DEFAULT 'PENDING' CHECK(delivery_state IN ('PENDING','SENT','FAILED')),
 CONSTRAINT reset_request_expiry CHECK(expires_at>created_at AND expires_at<=created_at + interval '15 minutes 5 seconds'),
 CONSTRAINT reset_request_outcome CHECK(consumed_at IS NULL OR (revoked_at IS NULL AND delivery_state='SENT'))
);
CREATE INDEX auth_password_reset_user_idx ON auth_password_reset_requests(user_id,created_at DESC);
CREATE UNIQUE INDEX auth_password_reset_one_active_per_user
 ON auth_password_reset_requests(user_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX auth_password_reset_active_expiry ON auth_password_reset_requests(expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL;
-- Only keyed HMAC(email) is stored for throttling. Requests for unknown users have the same counter policy.
CREATE TABLE auth_password_reset_windows (
 email_lookup_hash char(64) PRIMARY KEY,
 request_count int NOT NULL CHECK(request_count BETWEEN 1 AND 4),
 window_started_at timestamptz NOT NULL DEFAULT now(),
 last_request_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT reset_window_clock CHECK(last_request_at>=window_started_at)
);
CREATE INDEX auth_password_reset_windows_expiry ON auth_password_reset_windows(last_request_at);
COMMIT;
