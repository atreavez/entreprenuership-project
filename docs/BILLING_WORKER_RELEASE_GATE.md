# Billing reconciliation worker release gate

The API provides queue monitoring and recovery only. Migration 031 is reviewed in source, not evidence of an applied migration. No background process, real provider adapter or worker credential is enabled.

Before a worker can run:
- Apply and verify migrations 030 and 031 on an isolated disposable test database; validate the API role and all RLS policies.
- Provision a separate login named assettrust_billing_worker_<deployment>, with no elevated flags, role membership, DDL or broad schema grants. Never use the ordinary API login or database owner. Grant only the reviewed column-level queue, invoice state/payment reference, settlement, journal, subscription and audit access needed by the worker. Locking the existing audit identity also requires a reviewed privilege design; do not grant broad user-table writes as a workaround.
- Implement a dedicated pool/transaction composition with no API credentials. Verify role grants on startup and within settlement; use a service audit identity rather than arbitrary user-supplied identities. The current repository requires a tenant-specific active ORG_ADMIN audit identity, which must be assigned and reviewed before deployment.
- Ensure the approved provider policy matches the job snapshot. An operator-controlled dispatch gate defaults false; register only tested adapters. Provider transaction identities must be canonical and receipts independently authenticated.
- Test duplicate receipts, lease expiration, worker crashes after settlement before ACK, revoked policy, amount mismatch, cross-tenant data access, rollback and immutable records against PostgreSQL.
- Keep payment and entitlement availability explicitly disconnected in UI until verified release. No paid entitlement is an authorization bypass. Refunds, chargebacks, recurring allocation and automatic renewal require separate implementation.

The ordinary API role must never INSERT reconciliation jobs or modify lease fields or payment keys. Recovery requires recent MFA, original approved policy, an unleased stopped job, exact revision and a recorded reason.
