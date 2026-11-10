# AssetTrust v0.3 — Implementation status and release decision

**Date:** 6 November 2026 · **Compiled for:** Aturinzire Hargreave

## Scope of this checkpoint

This is an additive extension of the user-provided **AssetTrust v0.2 source-only checkpoint**, not an independently deployed app. v0.2 screens, API modules, permissions, task/dispute/monitoring/quote functionality and the existing project documentation are retained.

**New in v0.3:**

1. Versioned additive PostgreSQL migration `003_evidence_review.sql`.
2. Pure, independently testable evidence governance policy (`apps/api/src/verification-policy.ts`).
3. Separate `SUBMITTED`, `ACCEPTED` and `REJECTED` evidence states, with review notes and reviewer identity.
4. New case evidence review endpoint and audit event; no self-review and role/professional-approval gates.
5. Case-stage transition now requires accepted evidence by a different account; rejected/pending evidence no longer suffices.
6. Sensitive evidence references required for registry search, field inspection, legal review and final decisions.
7. Stricter case assignment gate for submission and advancement; explicit `OPEN` case checks.
8. Untracked-file cleanup after a failed document metadata transaction; both asset and case visibility required when a document references both.
9. Quote status guards no longer allow admins to unilaterally mark their own quote as customer accepted.
10. Resolving a dispute on a previously closed case no longer silently resets a flagged asset to ordinary in-review status.
11. Updated responsive case detail UI with review badges, decision notes and accept/reject controls; explicit non-official assurance language in reports.
12. Dependency-free offline policy suite and gated localhost HTTP/PostgreSQL e2e smoke script.
13. Automated CI workflow definition (unexecuted) and installation/runbook/security boundary documentation.

## Checks completed here

| Check | Outcome | Meaning |
|---|---|---|
| v0.2 offline domain smoke | Passed | Stage ordering, role checks, invitation/date helpers and local proof helper |
| v0.3 evidence policy suite | **17 checks passed** | Pure policy and structural checks for reviewer separation, stage matching and role gates |
| TS/TSX transpilation **syntax** | Passed on 25 source files | Parses with TypeScript; **not** full typechecking or builds |
| Source-based case page preview | Rendered | Case screen component tree can be statically rendered with fictional data |
| Chromium visual checks | Desktop 1440px + mobile 390px | No horizontal scroll width overflow on the two case-detail screenshots |
| Normal npm tests | **Blocked** | Local modules not installed; `ts-node/register` unavailable |
| Production build | **Blocked** | Local node type definitions and project dependencies unavailable |
| PostgreSQL migration / HTTP e2e | **Not run** | PostgreSQL/Docker absent; no npm registry access |
| CI workflow | **Not run** | Included as code for execution after checkout |

This checkpoint has **NO GO** status for production release or use with sensitive real-person records.

## Explicit non-features

- No official land-register integration or official ownership certification.
- No independently validated surveyor/lawyer professional licensing workflow.
- No external blockchain consensus or independent audit anchoring.
- No live payment collection, reconciled wallet/ledger, e-invoicing or settlement.
- No safe internet-facing identity stack (MFA, short-lived rotateable sessions, account recovery, account lockout, device management).
- No production-grade encrypted private object storage, malware scanning, document retention or disaster recovery.
- No external notifications/worker scheduler, geospatial surveying integration, low-connectivity field work, or lender/agency integrations.
- No independent security, legal, privacy or accessibility assessment.

## Release gate for the next milestone

On a connected development machine: run `npm install`, `npm test`, `npm run build`, migrate a fresh PostgreSQL database, run the gated localhost e2e, then test a preserved v0.2 database upgrade. Correct all failures. Only then consider upgrading identity/session security, RLS, object storage, professional accreditation and external integrations.
