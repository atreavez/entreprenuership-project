BEGIN;
-- Preserve monotonic timestamps while validating against actual database time.
-- Transaction start time can predate a concurrent writer that acquired the row first.
CREATE OR REPLACE FUNCTION assettrust_access_window_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE checked_at timestamptz := clock_timestamp();
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Access attempt window records may not be deleted by the application';
 END IF;
 IF (NEW.share_id,NEW.organization_id) IS DISTINCT FROM (OLD.share_id,OLD.organization_id) THEN
  RAISE EXCEPTION 'Access attempt tenant or share may not change';
 END IF;
 IF NEW.last_failed_at<OLD.last_failed_at OR NEW.last_failed_at>checked_at THEN
  RAISE EXCEPTION 'Invalid failure timestamp';
 END IF;
 IF NEW.window_started_at=OLD.window_started_at AND OLD.failed_count<10
  AND NEW.failed_count=OLD.failed_count+1 THEN RETURN NEW; END IF;
 IF NEW.window_started_at>=OLD.window_started_at + interval '15 minutes'
  AND NEW.window_started_at<=checked_at AND NEW.failed_count=1 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Access failure counters must increase by one or reset after window expiry';
END; $$;
COMMIT;
