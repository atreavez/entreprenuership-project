# AssetTrust v0.83 — Security Assessment

**Scope:** Source inspection, offline automated and fault-injection tests, and source-manifest checks, 12 November 2026.  
**Overall release decision:** **NO-GO** (unverified dependencies, build, live PostgreSQL, browser and full security gate).

## Findings addressed in source

| ID | Prior risk | Implemented mitigation | Verification |
|---|---|---|---|
| AUTH-V83-01 | An old password can be validated, then changed before its login creates a session | Recheck matched password digest and active account under `users FOR SHARE` until session/challenge issuance | New tests; live race **pending** |
| AUTH-V83-02 | Pending MFA login challenges survive password changes | Consume all pending challenges within password-change transaction | New tests incl. rollback fault injection; live **pending** |
| AUTH-V83-03 | Unused reset links survive normal password change | Revoke unconsumed reset requests in same transaction | New tests incl. rollback; live **pending** |
| AUTH-V83-04 | MFA confirmation can race with a password-only login based on stale MFA state | Conflicting user-row lock on enrollment/confirmation; fresh MFA state after login lock | New tests; live **pending** |
| AUTH-V83-05 | MFA challenge completed after credential replacement can mint a new session | Lock active challenge owner before consumption and session creation; keep MFA session proof within guarded operation | New tests; live **pending** |
| AUTH-V83-06 | MFA setup password check can go stale before credential enrollment | Verify current password while locking active account | New tests; live **pending** |

All SQL remains parameterized. Normal user authorization, current-role administrator MFA, revocation and audit mechanisms are preserved. No modification to the reviewed RLS SQL migration inventory.

## Measured checks

- v0.83 tests: **29/29 PASS**.
- v0.82 RED compatibility probe: **24/29 expected failures**, v0.83 GREEN: **29/29 PASS**. The comparison includes older source interface differences, not a real external attacker test.
- Version regression suites v0.41–v0.83: **43/43 PASS**, **844** counted passing cases.
- Earlier targeted suites v05/v18/v19/v20/v27/v29/v30/v37/v44/v45: all passed.
- Syntax transpilation, architecture, direct-dependency declarations, CI-policy and static source preflight: **PASS**.
- 27 SQL migration files: **byte-for-byte identical to v0.82**.
- Current-source secret scan: **PASS, 0 high-confidence findings / 3,683 files at the final documentation-stage scan**; this is not an independent secret audit.
- Real npm-backed build: **BLOCKED**; `npm run build` encounters missing installed NestJS/Node types and modules; registry DNS failed, authentic `package-lock.json` absent.
- Source Git history scan: **NOT RUN** (ZIP has no original Git history).
- Real PostgreSQL/ClamAV, authenticated HTTP, browser, DAST, deployment and adversarial tests: **NOT RUN**.

## Residual risk and required approval evidence

Concurrency behavior must be tested with live PostgreSQL row locks, real RLS runtime identity and concurrent connections. Implementations that pass simulated mocks are not necessarily safe under real network failures, pool exhaustion, transaction rollback, deploy races or timeout behavior. Password-reset relay reliability, full multi-tenant identity isolation, credential rotation/recovery, browser MFA UX and administrator actions require acceptance.

No release is permitted until all critical/high-severity findings are resolved, genuine lockfile and dependency audit are reviewed, full builds pass, real end-to-end and deployment validation pass, independent Git-history secret scanning/credential rotation is completed, and a signed security/release report records approval. Security-by-design remains mandatory, not a post-release checklist.
