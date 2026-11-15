# v0.26 Final Review — Domain policy correction and authorization boundaries

**Author:** Aturinzire Hargreave  
**Scope:** AssetTrust private evidence workflow only; no official title determination.

## Root cause: two incompatible conditions

The v0.25 domain function `mayAdvanceStage` required both `ORG_ADMIN` and `professionalApproved` at `FINAL_REVIEW`. Its infrastructure loader `loadCurrentWorkflowActor` correctly sets `professionalApproved=false` for non-professional roles, including `ORG_ADMIN`. Thus no real administrator could close a final-stage case. Separately, `isStageReviewer` required an accredited LEGAL_REVIEWER to accept `FINAL_REVIEW` evidence, but the `AccessService.case` and `canAssignCaseStage` rules admit only case creators, assignees or ORG_ADMINs, and the final-stage assignee must be an administrator. This made final evidence approval operationally unreachable.

## Resulting two-person policy

| Stage | Submitter/assignee rule | Independent reviewer | Advancer |
|---|---|---|---|
| INTAKE / DOCUMENT_REVIEW / REGISTRY_SEARCH | current authorized ORG_ADMIN/REVIEWER | separate ORG_ADMIN or REVIEWER | current ORG_ADMIN or assigned REVIEWER |
| FIELD_INSPECTION | assigned, currently accredited SURVEYOR | separate accredited SURVEYOR | assigned, currently accredited SURVEYOR |
| LEGAL_REVIEW | assigned, currently accredited LEGAL_REVIEWER | separate accredited LEGAL_REVIEWER | assigned, currently accredited LEGAL_REVIEWER |
| FINAL_REVIEW | current ORG_ADMIN creates DECISION evidence | **different** current ORG_ADMIN accepts | current ORG_ADMIN |

The enforcement rule `recorded_by !== reviewer.id` remains mandatory for every stage. Final advancement still requires accepted independent `DECISION` evidence, no active dispute, current role and organization membership, and an open case. The existing workflow transaction and audit records are preserved.

**Important limitation:** ordinary team invitations still exclude `ORG_ADMIN`; to use the two-person final approval process, an organization needs a secure, authorized second administrator already provisioned in the same tenant. v0.26 does not implement this privileged onboarding route. Implement an MFA-step-up, auditable co-admin invitation process before production. This is a known feature gap, not a condition to work around by altering production SQL manually.

## Test design

- RED baseline executed against v0.25 policy source: 5/10 new tests failed. The deadlock was directly reproduced.
- GREEN tests execute actual pure TypeScript domain/application modules through offline transpilation; this is stronger than checking only source strings but is **not** a live HTTP/database test.
- Coverage: final evidence accepted by a different admin; final closure and completed-asset status; current-role downgrade rejected; self-review rejected; ordinary reviewer and legal reviewer denied final approval; accreditation preserved in LEGAL_REVIEW; submitted or rejected decisions cannot advance; active dispute blocks closure; all six stages remain reachable under a valid role-and-evidence scenario.
- Older v0.3 final-role expectation was intentionally updated, and all 27 offline regression commands then passed.

## Follow-up release requirements

1. Implement secure co-administrator enrollment (strong one-use invitation, current role + recent MFA, transaction-safe controls, audit, second-factor setup).
2. Run PostgreSQL checks for independent approvals and role changes with the actual case service and access guard.
3. Build React and NestJS successfully from a reviewed, authentic `package-lock.json`, then run HTTP/browser E2E.
4. Verify legal and regulatory wording: AssetTrust approval and geospatial intersections are not official cadastral or land-title outcomes.

Architecture: framework-free evidence policy in DOMAIN; workflow orchestration in APPLICATION; database transactions and role/admission checks in INFRASTRUCTURE. No cross-layer dependency introduced by the fix.
