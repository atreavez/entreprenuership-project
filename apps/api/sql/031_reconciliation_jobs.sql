BEGIN;
-- Reconciliation queue schema. Dedicated settlement worker deployment remains disabled.
CREATE TABLE public.billing_reconciliation_jobs (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL CHECK(provider_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 transaction_id text NOT NULL CHECK(transaction_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 policy jsonb NOT NULL CHECK(jsonb_typeof(policy)='object'),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740990),
 state text NOT NULL CHECK(state IN ('QUEUED','PENDING','RETRY_REQUIRED','BLOCKED','REVIEW_REQUIRED','SETTLED')),
 attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 20),
 next_run_at bigint CHECK(next_run_at>=0),
 lease_token uuid,
 lease_until bigint CHECK(lease_until>=0),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,invoice_id,provider_id,transaction_id),
 FOREIGN KEY(organization_id,invoice_id) REFERENCES public.billing_invoices(organization_id,id),
 CHECK((state IN ('BLOCKED','REVIEW_REQUIRED','SETTLED'))=(next_run_at IS NULL)),
 CHECK((lease_token IS NULL)=(lease_until IS NULL)),
 CHECK(next_run_at IS NOT NULL OR lease_token IS NULL)
);
CREATE INDEX billing_reconciliation_due ON public.billing_reconciliation_jobs(organization_id,next_run_at,id) WHERE next_run_at IS NOT NULL;
CREATE TABLE public.billing_reconciliation_history (
 organization_id uuid NOT NULL,job_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>=0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,job_id,revision),
 FOREIGN KEY(organization_id,job_id) REFERENCES public.billing_reconciliation_jobs(organization_id,id)
);
ALTER TABLE public.billing_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reconciliation_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_reconciliation_jobs_select_v87 ON public.billing_reconciliation_jobs FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_reconciliation_jobs_insert_v87 ON public.billing_reconciliation_jobs FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_reconciliation_jobs_update_v87 ON public.billing_reconciliation_jobs FOR UPDATE TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_reconciliation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reconciliation_history FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_reconciliation_history_select_v87 ON public.billing_reconciliation_history FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_reconciliation_history_insert_v87 ON public.billing_reconciliation_history FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
COMMIT;
