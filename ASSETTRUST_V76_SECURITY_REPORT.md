# AssetTrust v0.76 — Security review and release gate

**Checkpoint:** v0.76 — operational financial quote, dispute, task and reminder protection.  
**Security decision:** **NO-GO for production**.

## Implemented controls

1. **Current-role authorization:** financial quote modifications, dispute resolution and case-task creation now verify the role from active PostgreSQL membership inside the mutation transaction. Suspended/demoted actors cannot rely on claims from an old login token.
2. **Case confidentiality and row-level isolation:** case task creation, dispute creation and case-specific task reading require current case participation; quote visibility for REVIEWER is restricted to assigned/created cases; all relevant joins enforce organization identity.
3. **Concurrency:** dispute report uses one `FOR UPDATE OF c FOR SHARE OF actor` statement; dispute resolution locks parent case before the individual dispute, serializing simultaneous status finalizations. Existing transaction wrappers roll back both business mutation and audit on failure.
4. **Receivers:** task assignment requires an active recipient; dispute notifications target only currently active organization administrators.
5. **Identity-scoped reads:** task, dispute, reminder and quote listings bind to the current active user row instead of a stale `ORG_ADMIN` boolean from the request.
6. **Security invariants:** preserve 27 migration checksums, exact RLS policy inventory, tenant scope, parameterized SQL and current source credential scan.

## Verification

RED 25/33 failures against v0.75; GREEN 33/33 against v0.76. Historical/current version suites v0.41-v0.76: 36/36 passing. Architecture, syntax, source imports, CI policy, and limited source credential scan passed. These are *offline verifications only*. See `TEST_EVIDENCE_V76.md`.

## Important remaining risks and blockers

- Authentic package-lock.json missing. npm ci, dependency audit and full build cannot be accepted, and `npm run build` fails for missing NestJS/Node/Argon2 types/dependencies.
- PostgreSQL locking and transaction serialization are not proven against a running nonowner RLS session. Concurrent tests must execute with two independent database connections on a disposable staging database.
- Finance scope remains quote issuance/voiding; **no assertion of payment collection, refund, invoicing, or wallet settlement**. All real financial transactions require server-authoritative amounts, idempotency, durable ledger/reconciliation and isolated permissions.
- Original Git-history secret scan is not available in this archive. Any discovered credentials must be rotated. Independent scanning required.
- MFA step-up, cross-tenant CRUD, phishing/session abuse, CSRF, cookie settings, malware scanning, TLS/SSH restrictions, production admin RBAC, backup/restore, rolling deployment, penetration testing, browser flows and actual payment-provider verification remain unapproved.

**Release policy:** Any failed critical gate blocks release. No bypasses, no temporary production credential exposure, and no claims of complete end-to-end security until independently verified.
