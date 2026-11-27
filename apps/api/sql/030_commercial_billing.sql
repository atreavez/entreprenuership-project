BEGIN;
-- Commercial billing schema. Runtime settlement remains disabled.
CREATE TABLE public.billing_catalog_versions (
 version integer PRIMARY KEY CHECK (version>0),
 prices jsonb NOT NULL CHECK (jsonb_typeof(prices)='array' AND jsonb_array_length(prices) BETWEEN 1 AND 100),
 approved_change_id uuid NOT NULL UNIQUE REFERENCES public.admin_configuration_changes(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.billing_invoices (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 catalog_version integer NOT NULL REFERENCES public.billing_catalog_versions(version),
 lines jsonb NOT NULL CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 100),
 total_ugx bigint NOT NULL CHECK (total_ugx BETWEEN 1 AND 1000000000),
 currency text NOT NULL DEFAULT 'UGX' CHECK (currency='UGX'),
 state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','ISSUED','PAID','VOID')),
 revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740990),
 payment_key text UNIQUE CHECK (payment_key IS NULL OR length(payment_key) BETWEEN 5 AND 300),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (organization_id,id),
 CHECK ((state='PAID')=(payment_key IS NOT NULL)),
 CHECK ((state='DRAFT' AND revision=0) OR (state='ISSUED' AND revision=1) OR
        (state='PAID' AND revision=2) OR (state='VOID' AND revision IN (1,2)))
);
CREATE INDEX billing_invoices_tenant_idx ON public.billing_invoices(organization_id,created_at DESC,id);
-- A journal row is a balanced debit/credit pair, not two independently writable postings.
CREATE TABLE public.billing_journal (
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 revision bigint NOT NULL CHECK (revision IN (1,2)),
 event text NOT NULL CHECK (event IN ('ISSUED','VOID','PAID')),
 debit_account text NOT NULL,
 credit_account text NOT NULL,
 amount_ugx bigint NOT NULL CHECK (amount_ugx BETWEEN 1 AND 1000000000),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (organization_id,invoice_id,revision),
 FOREIGN KEY (organization_id,invoice_id) REFERENCES public.billing_invoices(organization_id,id),
 CHECK ((event='ISSUED' AND revision=1 AND debit_account='RECEIVABLE' AND credit_account='DEFERRED_SERVICE_REVENUE') OR
        (event='VOID' AND revision=2 AND debit_account='DEFERRED_SERVICE_REVENUE' AND credit_account='RECEIVABLE') OR
        (event='PAID' AND revision=2 AND debit_account='PAYMENT_CLEARING' AND credit_account='RECEIVABLE'))
);
CREATE TABLE public.billing_settlements (
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL CHECK (provider_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 transaction_id text NOT NULL CHECK (transaction_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 amount_ugx bigint NOT NULL CHECK (amount_ugx BETWEEN 1 AND 1000000000),
 currency text NOT NULL CHECK (currency='UGX'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (provider_id,transaction_id),
 UNIQUE (organization_id,invoice_id),
 FOREIGN KEY (organization_id,invoice_id) REFERENCES public.billing_invoices(organization_id,id)
);
CREATE TABLE public.billing_subscriptions (
 organization_id uuid NOT NULL,
 funding_invoice_id uuid NOT NULL,
 code text NOT NULL CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 catalog_version integer NOT NULL REFERENCES public.billing_catalog_versions(version),
 starts_at bigint NOT NULL CHECK (starts_at>=0),
 ends_at bigint NOT NULL CHECK (ends_at<=8640000000000000 AND ends_at>starts_at),
 PRIMARY KEY (organization_id,funding_invoice_id),
 FOREIGN KEY (organization_id,funding_invoice_id) REFERENCES public.billing_invoices(organization_id,id),
 CHECK (ends_at-starts_at BETWEEN 86400000 AND 31622400000)
);
CREATE INDEX billing_subscriptions_tenant_idx ON public.billing_subscriptions(organization_id,code,ends_at);
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_invoices_select_v87 ON public.billing_invoices FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_invoices_insert_v87 ON public.billing_invoices FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_journal FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_journal_select_v87 ON public.billing_journal FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_journal_insert_v87 ON public.billing_journal FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settlements FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_settlements_select_v87 ON public.billing_settlements FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_settlements_insert_v87 ON public.billing_settlements FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_subscriptions_select_v87 ON public.billing_subscriptions FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_subscriptions_insert_v87 ON public.billing_subscriptions FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_invoices_update_v87 ON public.billing_invoices FOR UPDATE TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid)
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
-- No UPDATE or DELETE policies on journal, settlements or subscriptions.
-- Activation must additionally restrict runtime grants to catalog SELECT/INSERT,
-- invoice SELECT, column-restricted INSERT and UPDATE(state,revision), and journal/subscription
-- SELECT/INSERT. Settlement SELECT only; no payment_key write until a trusted worker exists.
-- No runtime DDL, TRUNCATE, DELETE, TRIGGER or REFERENCES grants.
COMMIT;
