BEGIN;
-- v0.45: shared, privacy-preserving login-abuse counter. No email/password/IP/token fields.
CREATE TABLE auth_login_abuse_windows (
 identity_hash char(64) PRIMARY KEY,
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 11),
 window_started_at timestamptz NOT NULL DEFAULT now(),
 last_attempt_at timestamptz NOT NULL DEFAULT now(),
 blocked_until timestamptz,
 CONSTRAINT valid_login_block_time CHECK (blocked_until IS NULL OR blocked_until>=window_started_at)
);
CREATE INDEX auth_login_abuse_cleanup_idx ON auth_login_abuse_windows(last_attempt_at);
-- Retain only the minimal aggregate; future cleanup must not erase still-active blocks.
COMMIT;
