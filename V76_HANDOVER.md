# AssetTrust v0.76 — Engineering handover

**Date:** 12 November 2026  
**Base:** v0.75 source checkpoint; no project reset  
**Release decision:** **NO-GO**, source-level validation only.

## Scope delivered

The operational API at `apps/api/src/operations.ts` now guards all quote, dispute, task and reminder entry points against token-stale permissions. `apps/api/src/contexts/access/infrastructure/transactional-access.ts` adds `requireCurrentCaseMutation`: a single PostgreSQL query locking both the case row for update and the active current user row for share, rejecting nonparticipants. It is used by dispute reporting so two reporters never have to upgrade an existing case-read lock.

The original service behavior and routes remain intact: `/api/v1/operations/tasks`, `/api/v1/operations/cases/:id/tasks`, `/api/v1/operations/disputes`, `/api/v1/operations/reminders`, and `/api/v1/operations/quotes`, with existing POST/PATCH operations.

Dispute resolution now locks in a predictable order: **current admin membership → parent case → target dispute → status and audit update**. This serializes simultaneous dispute finalizations on the same case. A terminal case cannot acquire a new dispute. Current role and participation are checked independently of the JWT's earlier `role` claim.

**No changes were made to PostgreSQL migration files (27/27 byte-identical) or the reviewed RLS contract.** No blockchain, payment processor, production seed or public database is touched.

## Offline test result

- New v0.76 regression: **33/33 passed**; the red version against v0.75 failed 25 scenarios.
- v0.41–v0.76 regression matrix: **36/36 version scripts passed**, with **631 reported TAP passing test cases** across the scripts (not a count of end-to-end acceptance tests).
- Source syntax transpilation: **108 TS/TSX files, zero syntax diagnostics**, not a full typecheck.
- DDD/architecture tests: **3/3 passed**; CI workflow policy passed; source relative-import gate passed.
- Limited current-source credential scanner: passed, **3,508 files**, zero high-confidence matches (not a full Git-history scan).
- Genuine lockfile check and release preflight: **BLOCKED**; no authentic `package-lock.json`.
- Full API+web build: **FAILED/BLOCKED** because NestJS, Argon2 and other dependencies/typings are not installed.
- Real PostgreSQL/PostGIS, ClamAV, two-organization HTTP/browser and concurrent transaction tests: **NOT EXECUTED**.

## Outstanding acceptance and owner steps

1. On trusted connected Kali, recover the reviewed lockfile from the original Git repository, or explicitly generate once if absent; review packages, install using `npm ci`, run audits and compile. Do not fake a lockfile or use `--force`.
2. Use only the isolated v0.70 disposable local test infrastructure, with an operator DB credential and a separate non-owner runtime login. Do not alter live or shared records.
3. Exercise the v0.76 test matrix with synthetic accounts and two DB connections: active A-admin, downgraded/suspended former A-admin, assigned A-reviewer, A-task owner, B-admin. A downgrade before the write must deny; if a write lock wins first, the admin role change must serialize or time out. No unaudited writes on denial.
4. Simultaneously resolve two different open disputes on one case; once both commit, the case must reopen. Submit two disputes concurrently to prove absence of lock-upgrade deadlock. A closed case must refuse new disputes.
5. Verify quotes have no payment collection side effect. Test actual entitlements, backend price control, platform super-admin vs org-admin RBAC/MFA, private documents, approvals, refunds/fees, safe uploads, CSRF/cookies, rate limits, TLS, rollback and restore separately.
6. Perform the mandatory original Git-history secret scan, independent vulnerability review, adversarial tenant tests, admin browser acceptance, full-release evidence and owner signoff. Critical failures block release.

Keep `DDD`, `TDD`, `SOLID`, `Clean Architecture`, current-role checking and the **FINAL SECURITY HARDENING AND RELEASE GATE**. Never treat successful mocks as PostgreSQL concurrency proof.
