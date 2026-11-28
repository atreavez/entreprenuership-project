# Commercial consistency and plan changes

New recurring purchases require exactly one recurring service, quantity one, in a separate invoice. Multiple one-time services remain supported. Existing mixed recurring invoices cannot be newly issued; void an unpaid incompatible draft and create a replacement. Existing settled mixed invoices require manual allocation review, not invented subscription terms.

Same-service renewals append purchased time. Different service codes purchase independent terms with no credit or cancellation of the original term. This is not a prorated upgrade/downgrade engine. Refunds and chargebacks need independently verified provider observations, append-only reversing journal entries and explicit entitlement reversal rules; none are activated.

GET /billing/invoices/:id/integrity requires current tenant administrator MFA and reads one consistent SQL snapshot. It reports local price, state/revision, journal, settlement and subscription funding discrepancies. It does not repair records, infer missing payments, verify external receipts or certify accounting statements. The check is per-invoice, not a complete ledger audit.
