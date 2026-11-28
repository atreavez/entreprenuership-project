BEGIN;
-- STAGED: do not apply until worker grants, integrity checks, entitlement
-- exclusion and approval administration are integrated and tested.
ALTER TABLE public.billing_settlements ADD CONSTRAINT billing_settlements_exact_funding_v87 UNIQUE(organization_id,invoice_id,provider_id,transaction_id);
CREATE TABLE public.billing_refund_requests (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL,
 transaction_id text NOT NULL,
 adjustment_id text NOT NULL CHECK(adjustment_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL,
 transaction_id text NOT NULL,
 adjustment_id text NOT NULL CHECK(adjustment_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 amount_ugx bigint NOT NULL CHECK(amount_ugx BETWEEN 1 AND 1000000000),
 submitted_by uuid NOT NULL REFERENCES public.users(id),
 approved_by uuid NOT NULL REFERENCES public.users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 12 AND 500 AND length(reason)<=500),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decision text NOT NULL DEFAULT 'APPROVE' CHECK(decision='APPROVE'),
 FOREIGN KEY(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx,submitted_by) REFERENCES public.billing_refund_requests(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx,submitted_by),
 FOREIGN KEY(organization_id,id,approved_by,decision) REFERENCES public.billing_refund_decisions(organization_id,request_id,reviewer_id,decision),
 CHECK(submitted_by<>approved_by),
 FOREIGN KEY(organization_id,invoice_id,provider_id,transaction_id) REFERENCES public.billing_settlements(organization_id,invoice_id,provider_id,transaction_id),
 UNIQUE(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx),
 UNIQUE(provider_id,adjustment_id)
);
CREATE TABLE public.billing_adjustments (
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL,
 transaction_id text NOT NULL,
 adjustment_id text NOT NULL CHECK(adjustment_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 kind text NOT NULL CHECK(kind IN ('REFUND','CHARGEBACK')),
 currency text NOT NULL CHECK(currency='UGX'),
 amount_ugx bigint NOT NULL CHECK(amount_ugx BETWEEN 1 AND 1000000000),
 approval_id uuid UNIQUE,
 debit_account text NOT NULL CHECK(debit_account='FINANCIAL_ADJUSTMENT_SUSPENSE'),
 credit_account text NOT NULL CHECK(credit_account='PAYMENT_CLEARING'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(provider_id,adjustment_id),
 CHECK((kind='REFUND')=(approval_id IS NOT NULL)),
 FOREIGN KEY(organization_id,invoice_id,provider_id,transaction_id) REFERENCES public.billing_settlements(organization_id,invoice_id,provider_id,transaction_id),
 FOREIGN KEY(organization_id,approval_id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx)
 REFERENCES public.billing_refund_approvals(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx)
);
CREATE INDEX billing_adjustment_invoice_v87 ON public.billing_adjustments(organization_id,invoice_id);
ALTER TABLE public.billing_refund_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refund_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_refund_approvals_select_v87 ON public.billing_refund_approvals FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_refund_approvals_insert_v87 ON public.billing_refund_approvals FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_adjustments_select_v87 ON public.billing_adjustments FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_adjustments_insert_v87 ON public.billing_adjustments FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refund_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_refund_requests_select_v87 ON public.billing_refund_requests FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_refund_requests_insert_v87 ON public.billing_refund_requests FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_refund_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refund_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_refund_decisions_select_v87 ON public.billing_refund_decisions FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_refund_decisions_insert_v87 ON public.billing_refund_decisions FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
-- No mutation policy for finalized approvals or reversals. Cumulative amount
-- limits require serialized invoice locking, not independent row CHECKs.
COMMIT;
),
 amount_ugx bigint NOT NULL CHECK(amount_ugx BETWEEN 1 AND 1000000000),
 submitted_by uuid NOT NULL REFERENCES public.users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 12 AND 500 AND length(reason)<=500),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx,submitted_by),
 UNIQUE(organization_id,provider_id,adjustment_id),
 FOREIGN KEY(organization_id,invoice_id,provider_id,transaction_id) REFERENCES public.billing_settlements(organization_id,invoice_id,provider_id,transaction_id)
);
CREATE TABLE public.billing_refund_decisions (
 organization_id uuid NOT NULL,
 request_id uuid NOT NULL,
 reviewer_id uuid NOT NULL REFERENCES public.users(id),
 decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 12 AND 500 AND length(reason)<=500),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,request_id),
 UNIQUE(organization_id,request_id,reviewer_id,decision),
 FOREIGN KEY(organization_id,request_id) REFERENCES public.billing_refund_requests(organization_id,id)
);
CREATE TABLE public.billing_refund_approvals (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL,
 transaction_id text NOT NULL,
 adjustment_id text NOT NULL CHECK(adjustment_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 amount_ugx bigint NOT NULL CHECK(amount_ugx BETWEEN 1 AND 1000000000),
 submitted_by uuid NOT NULL REFERENCES public.users(id),
 approved_by uuid NOT NULL REFERENCES public.users(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 12 AND 500 AND length(reason)<=500),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(submitted_by<>approved_by),
 FOREIGN KEY(organization_id,invoice_id,provider_id,transaction_id) REFERENCES public.billing_settlements(organization_id,invoice_id,provider_id,transaction_id),
 UNIQUE(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx),
 UNIQUE(provider_id,adjustment_id)
);
CREATE TABLE public.billing_adjustments (
 organization_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 provider_id text NOT NULL,
 transaction_id text NOT NULL,
 adjustment_id text NOT NULL CHECK(adjustment_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
 kind text NOT NULL CHECK(kind IN ('REFUND','CHARGEBACK')),
 currency text NOT NULL CHECK(currency='UGX'),
 amount_ugx bigint NOT NULL CHECK(amount_ugx BETWEEN 1 AND 1000000000),
 approval_id uuid UNIQUE,
 debit_account text NOT NULL CHECK(debit_account='FINANCIAL_ADJUSTMENT_SUSPENSE'),
 credit_account text NOT NULL CHECK(credit_account='PAYMENT_CLEARING'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(provider_id,adjustment_id),
 CHECK((kind='REFUND')=(approval_id IS NOT NULL)),
 FOREIGN KEY(organization_id,invoice_id,provider_id,transaction_id) REFERENCES public.billing_settlements(organization_id,invoice_id,provider_id,transaction_id),
 FOREIGN KEY(organization_id,approval_id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx)
 REFERENCES public.billing_refund_approvals(organization_id,id,invoice_id,provider_id,transaction_id,adjustment_id,amount_ugx)
);
CREATE INDEX billing_adjustment_invoice_v87 ON public.billing_adjustments(organization_id,invoice_id);
ALTER TABLE public.billing_refund_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refund_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_refund_approvals_select_v87 ON public.billing_refund_approvals FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_refund_approvals_insert_v87 ON public.billing_refund_approvals FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
ALTER TABLE public.billing_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_adjustments_select_v87 ON public.billing_adjustments FOR SELECT TO PUBLIC
 USING (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
CREATE POLICY billing_adjustments_insert_v87 ON public.billing_adjustments FOR INSERT TO PUBLIC
 WITH CHECK (organization_id = NULLIF(current_setting('assettrust.tenant_id', true), '')::uuid);
-- No mutation policy for finalized approvals or reversals. Cumulative amount
-- limits require serialized invoice locking, not independent row CHECKs.
COMMIT;
