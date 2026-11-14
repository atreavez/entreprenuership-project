# AssetTrust v0.76 — Operations authorization and dispute concurrency

12 November 2026 · Base: v0.75

## Implemented

- **Financial quotes:** Require locked, current organization administrator role within quote creation and status transition transactions. Quote listings now confirm current active membership, restrict `REVIEWER` visibility to cases they created or are assigned to, and join case ownership using organization IDs. Request-token privilege alone cannot grant quote access.
- **Disputes:** Require current case participation, reject disputes on a closed case, and acquire `FOR UPDATE OF c FOR SHARE OF actor` together before mutating. Dispute resolution locks the current administrator, then the parent case, then the dispute row, preventing two parallel finalizations from each observing the other's uncommitted OPEN dispute and leaving the case permanently BLOCKED.
- **Case tasks:** Scope listings by current database role and optionally require a transaction-scoped case access check. Task creation rechecks the current permitted role and case participation, and verifies that the proposed assignee is active. Task-status mutations lock the task and current membership in the same statement and permit only current administrators or current task assignees/creators.
- **Reminders:** List via current active membership and check locked asset-read permission in the reminder INSERT transaction.
- **Audit and tenant isolation:** Retain atomic audit insertion, parameterized SQL, PostgreSQL tenant scope and all 27 existing migration files and reviewed RLS policies.

## Test evidence

`tools/tests-v76/operations-current-authority-v76.test.cjs` runs against the actual transpiled service and permission adapter with injected fake PostgreSQL responses. 33 cases passed. A red regression against unmodified v0.75 recorded 25 failing tests and 8 passing tests; green v0.76 passed all 33. Other offline suites v0.41–v0.76 passed (36 version suites, 631 counted TAP test cases). See TEST_EVIDENCE_V76.md.

## Limitations

This source checkpoint has **not** passed the full dependency-backed API/web build nor real concurrent PostgreSQL HTTP acceptance. The genuine `package-lock.json`, Node dependencies, disposable live PostGIS, ClamAV, original `.git` history, and deployment evidence are absent from this environment. Production release remains **NO-GO**.
