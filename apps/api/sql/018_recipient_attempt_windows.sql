BEGIN;
-- v0.40: shared failed-credential counters for genuine report-share IDs only.
-- No IP addresses, bearer tokens, access codes, identity evidence or raw request bodies.
-- A row is bounded to one report share; counters may reset only after the fifteen-minute window.
CREATE TABLE report_share_access_windows (
 share_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 window_started_at timestamptz NOT NULL DEFAULT now(),
 failed_count int NOT NULL DEFAULT 0 CHECK(failed_count BETWEEN 0 AND 10),
 last_failed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT report_share_window_owner FOREIGN KEY (share_id,organization_id)
  REFERENCES report_recipient_shares(id,organization_id),
 CONSTRAINT report_share_window_time CHECK(last_failed_at>=window_started_at)
);
CREATE INDEX report_share_access_windows_tenant ON report_share_access_windows(organization_id,last_failed_at DESC);
CREATE FUNCTION assettrust_access_window_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Access attempt window records may not be deleted by the application';
 END IF;
 IF (NEW.share_id,NEW.organization_id) IS DISTINCT FROM (OLD.share_id,OLD.organization_id) THEN
  RAISE EXCEPTION 'Access attempt tenant or share may not change';
 END IF;
 IF NEW.last_failed_at<OLD.last_failed_at OR NEW.last_failed_at>now() THEN
  RAISE EXCEPTION 'Invalid failure timestamp';
 END IF;
 IF NEW.window_started_at=OLD.window_started_at AND OLD.failed_count<10
  AND NEW.failed_count=OLD.failed_count+1 THEN RETURN NEW; END IF;
 IF NEW.window_started_at>=OLD.window_started_at + interval '15 minutes'
  AND NEW.window_started_at<=now() AND NEW.failed_count=1 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Access failure counters must increase by one or reset after window expiry';
END; $$;
CREATE TRIGGER report_share_access_window_guard BEFORE UPDATE OR DELETE ON report_share_access_windows
 FOR EACH ROW EXECUTE FUNCTION assettrust_access_window_guard();
COMMIT;
