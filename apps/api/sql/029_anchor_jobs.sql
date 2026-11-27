BEGIN;
-- Anchoring persistence. Provider dispatch stays disabled until separately authorized.
CREATE TABLE public.anchor_jobs (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 commitment text NOT NULL CHECK (commitment ~ '^[0-9a-f]{64}$'),
 provider_id text NOT NULL,
 network_id text NOT NULL,
 settings jsonb NOT NULL CHECK (jsonb_typeof(settings)='object'),
 revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740990),
 state text NOT NULL CHECK (state IN ('QUEUED','RETRY_REQUIRED','SUBMITTED','PENDING','CONFIRMED','REORG_OR_INVALID','BLOCKED','MANUAL_REVIEW')),
 transaction_id text,
 failures integer NOT NULL CHECK (failures BETWEEN 0 AND 20),
 next_run_at bigint CHECK (next_run_at>=0),
 confirmations bigint CHECK (confirmations>=0),
 lease_token uuid,
 lease_until bigint,
 UNIQUE (organization_id,provider_id,network_id,commitment),
 UNIQUE (organization_id,id),
 CHECK (settings->'target'->>'providerId' IS NOT DISTINCT FROM provider_id),
 CHECK (settings->'target'->>'networkId' IS NOT DISTINCT FROM network_id),
 CHECK ((lease_token IS NULL)=(lease_until IS NULL)),
 CHECK ((state IN ('BLOCKED','MANUAL_REVIEW'))=(next_run_at IS NULL)),
 CHECK (state NOT IN ('SUBMITTED','PENDING','CONFIRMED','REORG_OR_INVALID') OR transaction_id IS NOT NULL),
 CHECK (state<>'QUEUED' OR transaction_id IS NULL),
 CHECK ((state='CONFIRMED')=(confirmations IS NOT NULL)),
 CHECK (state<>'CONFIRMED' OR confirmations >= (settings->'target'->>'minConfirmations')::integer)
);
CREATE INDEX anchor_jobs_due_idx ON public.anchor_jobs(organization_id,next_run_at,id) WHERE next_run_at IS NOT NULL;
CREATE TABLE public.anchor_job_history (
 organization_id uuid NOT NULL,
 job_id uuid NOT NULL,
 revision bigint NOT NULL CHECK (revision>=0),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (organization_id,job_id,revision),
 FOREIGN KEY (organization_id,job_id) REFERENCES public.anchor_jobs(organization_id,id)
);
ALTER TABLE public.anchor_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anchor_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY anchor_jobs_select_v87 ON public.anchor_jobs FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY anchor_jobs_insert_v87 ON public.anchor_jobs FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY anchor_jobs_update_v87 ON public.anchor_jobs FOR UPDATE TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.anchor_job_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anchor_job_history FORCE ROW LEVEL SECURITY;
CREATE POLICY anchor_job_history_select_v87 ON public.anchor_job_history FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY anchor_job_history_insert_v87 ON public.anchor_job_history FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
COMMIT;
