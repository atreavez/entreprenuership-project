BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
-- Submitted spatial data is evidence, never an authoritative title/cadastral record.
CREATE TABLE IF NOT EXISTS parcel_boundary_claims (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 asset_id uuid NOT NULL REFERENCES assets(id),
 geometry geometry(Polygon,4326) NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','ACCEPTED','REJECTED','SUPERSEDED')),
 source_kind text NOT NULL CHECK (source_kind IN ('CLIENT_SKETCH','FIELD_SURVEY','DOCUMENT_TRANSCRIPTION')),
 source_reference text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 submitted_by uuid NOT NULL REFERENCES users(id),
 reviewed_by uuid REFERENCES users(id),
 review_notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 reviewed_at timestamptz,
 CONSTRAINT valid_parcel_geometry CHECK (ST_IsValid(geometry)),
 CONSTRAINT positive_parcel_area CHECK(ST_Area(geometry::geography)>0)
);
CREATE INDEX IF NOT EXISTS boundary_claims_org_asset ON parcel_boundary_claims(organization_id,asset_id,created_at DESC);
CREATE INDEX IF NOT EXISTS boundary_claims_geo ON parcel_boundary_claims USING GIST(geometry);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_reviewed_boundary ON parcel_boundary_claims(asset_id) WHERE status='ACCEPTED';
COMMIT;
