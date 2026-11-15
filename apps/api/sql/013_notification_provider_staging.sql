BEGIN;
-- v0.33 Admin Control Plane: record STAGED routes only. This schema never stores live transport secrets.
-- External messages cannot be sent until a separately reviewed delivery adapter and runtime are deployed.
CREATE TABLE admin_notification_routes (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 channel varchar(8) NOT NULL CHECK(channel IN ('EMAIL','SMS')),
 provider varchar(20) NOT NULL CHECK(provider IN ('NONE','SMTP_RELAY','HTTPS_RELAY')),
 status varchar(12) NOT NULL CHECK(status IN ('DISABLED','STAGED')),
 sender_label varchar(80) NOT NULL CHECK(char_length(sender_label) BETWEEN 3 AND 80 AND sender_label !~ '[<>]'),
 credential_ref varchar(90),
 version integer NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,channel),
 CONSTRAINT notification_route_actor FOREIGN KEY(updated_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT notification_route_channel CHECK(channel='EMAIL' OR provider<>'SMTP_RELAY'),
 CONSTRAINT notification_route_state CHECK(
  (status='DISABLED' AND provider='NONE' AND credential_ref IS NULL)
  OR (status='STAGED' AND provider<>'NONE' AND credential_ref ~ '^vault://[a-z][a-z0-9-]{1,30}/[a-z][a-z0-9-]{1,40}$')
 )
);
CREATE TABLE admin_notification_route_changes (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 channel varchar(8) NOT NULL CHECK(channel IN ('EMAIL','SMS')),
 provider varchar(20) NOT NULL CHECK(provider IN ('NONE','SMTP_RELAY','HTTPS_RELAY')),
 requested_status varchar(12) NOT NULL CHECK(requested_status IN ('DISABLED','STAGED')),
 sender_label varchar(80) NOT NULL CHECK(char_length(sender_label) BETWEEN 3 AND 80 AND sender_label !~ '[<>]'),
 credential_ref varchar(90),
 expected_version integer NOT NULL CHECK(expected_version>=0),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 12 AND 500),
 status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 proposed_by uuid NOT NULL,
 decided_by uuid,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CONSTRAINT notification_proposal_submitter FOREIGN KEY(proposed_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT notification_proposal_reviewer FOREIGN KEY(decided_by,organization_id) REFERENCES users(id,organization_id),
 CONSTRAINT notification_proposal_channel CHECK(channel='EMAIL' OR provider<>'SMTP_RELAY'),
 CONSTRAINT notification_proposal_two_admins CHECK(decided_by IS NULL OR decided_by<>proposed_by),
 CONSTRAINT notification_proposal_state CHECK(
  (requested_status='DISABLED' AND provider='NONE' AND credential_ref IS NULL)
  OR (requested_status='STAGED' AND provider<>'NONE' AND credential_ref ~ '^vault://[a-z][a-z0-9-]{1,30}/[a-z][a-z0-9-]{1,40}$')
 ),
 CONSTRAINT notification_proposal_review CHECK(
  (status='PENDING' AND decided_by IS NULL AND decided_at IS NULL)
  OR (status IN ('APPROVED','REJECTED') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX notification_one_pending_per_channel ON admin_notification_route_changes(organization_id,channel) WHERE status='PENDING';
CREATE INDEX notification_route_change_timeline ON admin_notification_route_changes(organization_id,proposed_at DESC);
COMMIT;
