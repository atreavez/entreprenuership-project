BEGIN;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_format text NOT NULL DEFAULT 'LEGACY_PLAINTEXT';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_key_id text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='documents_storage_format_check') THEN
  ALTER TABLE documents ADD CONSTRAINT documents_storage_format_check CHECK(storage_format IN ('LEGACY_PLAINTEXT','AES_256_GCM_V1'));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_documents_storage_format ON documents(storage_format);
COMMIT;
