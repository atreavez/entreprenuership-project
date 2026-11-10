BEGIN;
CREATE TABLE IF NOT EXISTS organizations (
 id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 full_name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('ORG_ADMIN','CLIENT','REVIEWER','SURVEYOR','LEGAL_REVIEWER')),
 professional_approved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE TABLE IF NOT EXISTS assets (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 asset_code text NOT NULL UNIQUE, asset_type text NOT NULL CHECK (asset_type IN ('LAND','BUILDING','VEHICLE','MACHINERY','COOPERATIVE_ASSET')),
 district text NOT NULL, description text NOT NULL DEFAULT '', declared_owner text NOT NULL,
 tenure text, parcel_reference text, area_acres numeric(14,4),
 status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('UNVERIFIED','IN_REVIEW','REVIEW_COMPLETED','FLAGGED')),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS verification_cases (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 case_code text NOT NULL UNIQUE, asset_id uuid NOT NULL REFERENCES assets(id),
 stage text NOT NULL DEFAULT 'INTAKE' CHECK (stage IN ('INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW','CLOSED')),
 status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','BLOCKED','CLOSED')),
 assigned_to uuid REFERENCES users(id), notes text NOT NULL DEFAULT '',
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_org ON verification_cases(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS case_evidence (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL REFERENCES verification_cases(id),
 stage text NOT NULL CHECK (stage IN ('INTAKE','DOCUMENT_REVIEW','REGISTRY_SEARCH','FIELD_INSPECTION','LEGAL_REVIEW','FINAL_REVIEW')),
 evidence_type text NOT NULL CHECK (evidence_type IN ('IDENTITY','DOCUMENT','REGISTRY_SEARCH','FIELD_REPORT','LEGAL_OPINION','DECISION','OTHER')),
 source_name text NOT NULL, reference text NOT NULL DEFAULT '', observations text NOT NULL,
 recorded_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON case_evidence(case_id,stage);
CREATE TABLE IF NOT EXISTS documents (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 asset_id uuid REFERENCES assets(id), case_id uuid REFERENCES verification_cases(id),
 display_name text NOT NULL, stored_name text NOT NULL UNIQUE, mime_type text NOT NULL,
 file_size bigint NOT NULL, sha256 text NOT NULL, review_status text NOT NULL DEFAULT 'SUBMITTED'
 CHECK (review_status IN ('SUBMITTED','REVIEWED','REJECTED')),
 uploaded_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT document_belongs_somewhere CHECK (asset_id IS NOT NULL OR case_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
 event_sequence bigserial UNIQUE, id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, entity_type text NOT NULL,
 entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 previous_hash text NOT NULL, event_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(organization_id,created_at DESC);
COMMIT;
