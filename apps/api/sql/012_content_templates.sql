BEGIN;
-- v0.31: versioned, plain-text administration templates. Evidence and legal disclaimers remain immutable in application policy.
CREATE TABLE admin_content_templates (
 scope text NOT NULL CHECK(scope IN ('organization','platform')),
 scope_id uuid NOT NULL,
 template_key varchar(90) NOT NULL,
 body text NOT NULL CHECK(char_length(body) BETWEEN 5 AND 1200),
 revision integer NOT NULL CHECK(revision>0),
 updated_by uuid NOT NULL,
 updated_by_org_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,scope_id,template_key),
 CONSTRAINT content_template_actor FOREIGN KEY(updated_by,updated_by_org_id) REFERENCES users(id,organization_id),
 CONSTRAINT content_template_scope CHECK ((scope='platform' AND scope_id='00000000-0000-0000-0000-000000000000'::uuid) OR (scope='organization' AND scope_id=updated_by_org_id)),
 CONSTRAINT content_template_not_html CHECK(body !~ '[<>]')
);
CREATE TABLE admin_content_proposals (
 id uuid PRIMARY KEY,
 scope text NOT NULL CHECK(scope IN ('organization','platform')),
 scope_id uuid NOT NULL,
 template_key varchar(90) NOT NULL,
 proposed_body text NOT NULL CHECK(char_length(proposed_body) BETWEEN 5 AND 1200),
 expected_revision integer NOT NULL CHECK(expected_revision>=0),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 12 AND 500),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 submitted_by uuid NOT NULL,
 submitted_org_id uuid NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid,
 reviewed_org_id uuid,
 reviewed_at timestamptz,
 CONSTRAINT content_proposal_submitter FOREIGN KEY(submitted_by,submitted_org_id) REFERENCES users(id,organization_id),
 CONSTRAINT content_proposal_reviewer FOREIGN KEY(reviewed_by,reviewed_org_id) REFERENCES users(id,organization_id),
 CONSTRAINT content_proposal_tenant CHECK ((scope='platform' AND scope_id='00000000-0000-0000-0000-000000000000'::uuid) OR (scope='organization' AND scope_id=submitted_org_id)),
 CONSTRAINT content_reviewer_tenant CHECK (scope<>'organization' OR reviewed_org_id IS NULL OR reviewed_org_id=scope_id),
 CONSTRAINT content_distinct_reviewers CHECK(reviewed_by IS NULL OR reviewed_by<>submitted_by OR template_key='branding.workspace_tagline'),
 CONSTRAINT content_review_complete CHECK((status='PENDING' AND reviewed_by IS NULL AND reviewed_org_id IS NULL AND reviewed_at IS NULL)
   OR (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_org_id IS NOT NULL AND reviewed_at IS NOT NULL)),
 CONSTRAINT content_proposal_not_html CHECK(proposed_body !~ '[<>]')
);
CREATE UNIQUE INDEX content_one_pending_per_key ON admin_content_proposals(scope,scope_id,template_key) WHERE status='PENDING';
CREATE INDEX content_proposal_timeline ON admin_content_proposals(scope,scope_id,submitted_at DESC);
COMMIT;
