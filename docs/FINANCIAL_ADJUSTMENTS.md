# Financial adjustment foundation — staged, not enabled

Refund and chargeback observations are read-only provider I/O. No funds are moved by this implementation. The original invoice remains historically PAID; a separate append-only adjustment records a verified reduction in retained payment. The suspense debit / payment-clearing credit pair is an operational balancing entry, not final statutory revenue, tax or chargeback-fee accounting.

Voluntary refunds require an exact independent approval record before recording. External confirmed chargebacks do not require such approval. An externally confirmed refund lacking approval requires investigation, not a fabricated approval. Approval identities and authority must be validated by a future dual-control administration workflow before activation. An approval of recording is not authority to initiate external funds movement.

Cumulative reversals cannot exceed the original settlement. Exact duplicate observations are read-only; altered replay or conflicts require review. Provider IDs must identify canonical events across refund/chargeback types.

Proposed optional entitlement policy: any confirmed partial reversal stops access from that funding term pending review, a full reversal invalidates funding. Core verification, documents and security are not commercial entitlements. This policy is not yet wired into live entitlement or renewal queries. Other legitimate paid terms must remain unaffected.

Migration 032 stays outside the reviewed manifest. Before promotion, integrate independent approval requests/decisions, worker grants and durable queue, adjustment-aware integrity reporting and optional entitlement/renewal exclusion, financial register, real PostgreSQL concurrency and rollback tests. Resolve chargeback reinstatement, external refund initiation and plan-change/proration policy separately. No adapters or credentials are activated.
