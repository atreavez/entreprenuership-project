# AssetTrust v0.25 — Current workflow and assignment authorization

**Compiled by Aturinzire Hargreave.** Development checkpoint, not an official land-title register or certified property record.

## Problem addressed

Before v0.25, `EvidenceWorkflow.review` and `EvidenceWorkflow.advance` used `ReviewActor.role` and `ReviewActor.professionalApproved` from the request; the case row was transaction-locked but the actual reviewer’s current role, tenant membership and professional accreditation were not checked again inside the write transaction. Case assignment also checked the administrator and assignee outside the transaction, then updated the assignment without rechecking their current roles or organization membership.

## v0.25 controls

- New **infrastructure adapter** `current-workflow-authorizer.ts` loads the current `users` row using a tenant-scoped query and `FOR SHARE` row lock while the `verification_cases` row is already locked `FOR UPDATE` by the workflow repository.
- For `SURVEYOR` and `LEGAL_REVIEWER`, the adapter checks that the corresponding accreditation has not been revoked and has not expired. It holds a `FOR SHARE` lock on the matching record during the decision. This replaces the authority of the cached `professionalApproved` flag.
- The **application port** `WorkflowTransaction.getCurrentActor(...)` is invoked by evidence review, readiness assessment, and stage advancement. The existing pure domain policy decides whether that current actor is eligible to accept evidence or advance a case.
- New **pure domain rule** `canAssignCaseStage` restricts case assignments by stage: SURVEYOR at field inspection, LEGAL_REVIEWER at legal review, ORG_ADMIN at final review, and ORG_ADMIN/REVIEWER at initial/document/registry stages. No assignments to closed cases.
- New **infrastructure adapter** `current-case-assignment.ts` checks a currently authorized ORG_ADMIN and an assignee who remains in the same organization; it locks the case and both user rows inside the same transaction as the assignment, notification and audit entry. Surveyor and legal reviewer assignments also require active, locked professional accreditation.
- The `CasesService.assign` handler now treats pre-request role checks as hints only; transactional checks are authoritative.

## Concurrency assumptions and limits

PostgreSQL row locks protect against concurrent **row UPDATE or DELETE** for the rows successfully selected in the same transaction; they do not imply official legal authority or validate the truth of supporting title/land documents. This revision does not cover the entire permission surface (including access-grant endpoints and read operations), and does not guarantee full authorization race coverage until all mutation paths have been audited and tested against a live database. A revoked credential cannot authorize a new review after its transaction has committed; a revocation that occurs after an already-authorized transaction commits does not retroactively undo that decision.

## Verification and unresolved blockers

- 21 v0.25 unit, behavioral and structural tests passed, using actual application/service and infrastructure TypeScript compiled in a controlled test harness.
- Strict isolated TypeScript check passed for the new domain/application/adapters.
- 26 total previous + current verification **commands** passed, including offline regression checks and 58-source-file syntax validation. This is not a full runtime build.
- New rollback-only live SQL test: `tools/e2e-pg-workflow-v25.mjs`, executed only with explicit disposable-db authorization. **Not run against PostgreSQL in this environment.**
- Complete application build failed due to missing npm packages; a genuine `package-lock.json` has not been created, and the release gate rejects the absence.

**Release decision: BLOCKED.** Do not deploy to production or treat evidence acceptance as proof of title, government registry confirmation, or official survey boundaries.
