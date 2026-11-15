BEGIN;
-- v0.39: private, independently approved capability grants for recipient PDF access.
-- Only SHA-256 commitments of two *random 256-bit* credentials are persisted.
CREATE TABLE report_recipient_shares (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 report_id uuid NOT NULL,
 recipient_label text NOT NULL CHECK(char_length(recipient_label) BETWEEN 3 AND 80),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 20 AND 500),
 token_sha256 char(64) NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 code_sha256 char(64) NOT NULL CHECK(code_sha256 ~ '^[a-f0-9]{64}$'),
 expires_hours int NOT NULL CHECK(expires_hours BETWEEN 1 AND 168),
 max_downloads int NOT NULL CHECK(max_downloads BETWEEN 1 AND 5),
 download_count int NOT NULL DEFAULT 0 CHECK(download_count BETWEEN 0 AND max_downloads),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REJECTED','REVOKED')),
 proposed_by uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 expires_at timestamptz,
 revoked_by uuid,
 revoked_at timestamptz,
 revocation_reason text,
 CONSTRAINT share_report_tenant FOREIGN KEY(report_id,organization_id) REFERENCES issued_verification_reports(id,organization_id),
 CONSTRAINT share_proposer_tenant FOREIGN KEY(proposed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT share_reviewer_tenant FOREIGN KEY(reviewed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT share_revoker_tenant FOREIGN KEY(revoked_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT share_separation CHECK(reviewed_by IS NULL OR reviewed_by<>proposed_by),
 CONSTRAINT share_review_consistency CHECK(
   (status='PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND expires_at IS NULL AND revoked_by IS NULL)
   OR (status='REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND expires_at IS NULL AND revoked_by IS NULL)
   OR (status='ACTIVE' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND expires_at IS NOT NULL AND revoked_by IS NULL)
   OR (status='REVOKED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND expires_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
 )
);
CREATE INDEX report_recipient_shares_org_recent ON report_recipient_shares(organization_id,proposed_at DESC);
CREATE INDEX report_recipient_shares_report ON report_recipient_shares(organization_id,report_id,status);
CREATE UNIQUE INDEX report_recipient_share_org_id ON report_recipient_shares(id,organization_id);
-- App-level transaction locks are reinforced by a limited state machine in SQL.
CREATE FUNCTION assettrust_share_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.organization_id,NEW.report_id,NEW.recipient_label,NEW.reason,NEW.token_sha256,NEW.code_sha256,
     NEW.expires_hours,NEW.max_downloads,NEW.proposed_by,NEW.proposed_at)
  IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.report_id,OLD.recipient_label,OLD.reason,OLD.token_sha256,OLD.code_sha256,
     OLD.expires_hours,OLD.max_downloads,OLD.proposed_by,OLD.proposed_at) THEN
  RAISE EXCEPTION 'Share origin and capability hashes are immutable';
 END IF;
 IF OLD.status='PENDING' AND NEW.status IN ('ACTIVE','REJECTED') AND NEW.download_count=0
    AND NEW.revoked_by IS NULL AND NEW.revoked_at IS NULL AND NEW.revocation_reason IS NULL THEN
  RETURN NEW;
 END IF;
 IF OLD.status='ACTIVE' AND NEW.status='REVOKED' AND NEW.download_count=OLD.download_count
    AND NEW.reviewed_by=OLD.reviewed_by AND NEW.reviewed_at=OLD.reviewed_at AND NEW.expires_at=OLD.expires_at THEN
  RETURN NEW;
 END IF;
 IF OLD.status='ACTIVE' AND NEW.status='ACTIVE' AND NEW.download_count=OLD.download_count+1
    AND NEW.reviewed_by=OLD.reviewed_by AND NEW.reviewed_at=OLD.reviewed_at AND NEW.expires_at=OLD.expires_at
    AND NEW.revoked_by IS NULL THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Illegal report recipient share transition';
END; $$;
CREATE TRIGGER report_recipient_share_transition BEFORE UPDATE OR DELETE ON report_recipient_shares
 FOR EACH ROW EXECUTE FUNCTION assettrust_share_transition_guard();
-- A successful server-side redemption is append-only. It does not prove client saved the file.
CREATE TABLE report_share_redemptions (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 share_id uuid NOT NULL,
 report_id uuid NOT NULL,
 pdf_sha256 char(64) NOT NULL CHECK(pdf_sha256 ~ '^[a-f0-9]{64}$'),
 signing_key_id text NOT NULL,
 redeemed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT share_redemption_owner FOREIGN KEY(share_id,organization_id) REFERENCES report_recipient_shares(id,organization_id),
 CONSTRAINT share_redemption_report FOREIGN KEY(report_id,organization_id) REFERENCES issued_verification_reports(id,organization_id)
);
CREATE INDEX report_share_redemptions_recent ON report_share_redemptions(organization_id,share_id,redeemed_at DESC);
CREATE FUNCTION assettrust_redemption_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Report share redemption history is append-only'; END; $$;
CREATE TRIGGER report_share_redemption_immutable BEFORE UPDATE OR DELETE ON report_share_redemptions
 FOR EACH ROW EXECUTE FUNCTION assettrust_redemption_immutable();
COMMIT;
