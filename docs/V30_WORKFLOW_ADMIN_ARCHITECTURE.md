# AssetTrust v0.30 — Workflow administration architecture

**Compiled by Aturinzire Hargreave.** Implementation based on v0.29. This is a constrained, real administrative capability rather than an unrestricted drag-and-drop workflow engine.

## System boundaries and responsibilities
- **Domain:** `apps/api/src/contexts/workflow-admin/domain/workflow-policy.ts` — allowable stages, validated stage targets, optional extra evidence types, default policy, optimistic version guard, and deterministic monotonic readiness overlay. No NestJS, SQL, HTTP or I/O dependencies.
- **Application:** `contexts/verification/application/evidence-workflow.ts` — reads effective policy during case readiness **and** advancement, then refuses progression if either the core mandatory evidence or the additional configured evidence has not been independently accepted.
- **Infrastructure:** `contexts/workflow-admin/infrastructure/workflow-admin.module.ts` — NestJS controller, current admin + MFA guards, Postgres row/advisory locks, independent approval, audit entries. `contexts/verification/infrastructure/postgres-workflow.repository.ts` retrieves approved policy from the current tenant within the case transaction, with a shared lock.
- **Presentation:** `apps/web/src/WorkflowAdminPage.tsx`, route `#workflows`, 6-stage navigator, editor, history/decisions, governance warnings, and fictional source-rendered preview.

## Live API routes (after a real build/migration)
All routes require `AuthGuard` and current tenant administrator authorization. POST routes additionally require active MFA plus a session step-up less than five minutes old.

| Route | Function |
|---|---|
| `GET /api/v1/admin-workflows/stages` | Current organization's effective configuration, mandatory evidence and revision numbers |
| `GET /api/v1/admin-workflows/changes` | Tenant-scoped most recent 100 proposals and decisions |
| `POST /api/v1/admin-workflows/changes` | Propose one stage revision (no immediate effect) |
| `POST /api/v1/admin-workflows/changes/:id/decision` | A different current administrator approves or rejects |
| `GET /api/v1/cases/:id/readiness` | Now includes `workflowPolicyVersion`, `targetDays`, `reminderDays` and `additionalEvidenceRequired` for an open stage |
| `POST /api/v1/cases/:id/advance` | Rejects unaccepted additional evidence and still enforces mandatory independent evidence |

Example proposal body:

```json
{
  "stage": "FIELD_INSPECTION",
  "targetDays": 10,
  "reminderDays": 3,
  "additionalEvidenceType": "DOCUMENT",
  "expectedVersion": 0,
  "reason": "Request a separately reviewed supporting document for each field inspection"
}
```

A new record is `PENDING`, not effective. Another current administrator with fresh MFA sends `{"decision":"APPROVE"}` to the decision endpoint. If the active policy version changed, the approval fails rather than overwriting the new record. The policy is updated and its audit entry recorded in the **same transaction**.

## Non-overridable safeguards
1. The exact stage order is fixed: `INTAKE → DOCUMENT_REVIEW → REGISTRY_SEARCH → FIELD_INSPECTION → LEGAL_REVIEW → FINAL_REVIEW → CLOSED`.
2. Mandatory evidence (identity, document, registry search, field report, legal opinion, final decision) remains required for the corresponding stage. An extra document requirement is **in addition to** the mandatory type, never a replacement.
3. An extra item qualifies only when it is stage-matched, accepted, and reviewed by a different person from its recorder. It is evaluated during advancement, not merely displayed.
4. Surveyor/legal accreditation checks, case assignment rules, recent MFA, disputed-case blocks, tenant-scoped access and independent final review retain their existing enforcement points.
5. `CLOSED` is never editable. Neither case completion nor evidence hashes prove government-verified ownership or legal title.
6. Tenant-matching foreign keys constrain proposers, approvers and update authors. Unique index prevents multiple pending proposals for one stage. All changes are audited.

## Deployment and configuration limitations
- Target and reminder durations are stored and returned for UI/readiness. **Automatic reminder scheduling and notification delivery are not implemented** by this module; these values do not create jobs or send messages.
- There is no arbitrary rule-language execution, custom role builder, stage deletion/reordering or cross-tenant editing.
- Core legal disclaimers and protected evidence records are deliberately not editable from an admin interface.
- The old `workflow.review_target_days` key remains separate **legacy metadata** to preserve compatibility and does not drive stage enforcement. Use the Workflow Designer for active stage policies.
- `011_workflow_admin.sql` is an append-only migration. Its SHA-256 is recorded in `schema-manifest.ts`; historical migrations and their digests are unchanged.
- Updates to a workflow policy can affect open cases at that stage on their **next** readiness/advance check. For production rollout, organizations should be notified before an approved stricter gate takes effect. Existing accepted evidence is not rewritten.

## Future control-plane phases
Introduce audited template editing, pricing and entitlement policies, notification/provider routing, granular permission governance, a supported workflow-version migration/activation model, and staged configuration rollouts with safe previews. Maintain the fail-closed evidence and official-registry boundaries throughout.
