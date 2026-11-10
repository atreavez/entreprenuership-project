# AssetTrust v0.4 — DDD, TDD, SOLID, Clean Architecture and Security by Design

**Compiled by Aturinzire Hargreave**  
**Project:** AssetTrust (Uganda-first land and asset verification)  
**Checkpoint:** v0.4, 6 November 2026

## Architecture decision

These engineering principles are **mandatory** for future code, not merely report terminology:

- **Domain-Driven Design:** explicit bounded contexts, ubiquitous language, aggregates, invariants, and distinct submitted-evidence versus accepted-evidence states.
- **TDD:** start with a failing test, implement the smallest green change, then refactor while preserving tests. Test security-negative paths before adding UI features.
- **SOLID:** components have one reason to change; extend through repository ports; business logic is substitutable with test doubles and independent of controllers; interfaces remain narrow; dependencies point inward.
- **Clean Architecture:** domain -> application use cases -> ports <- infrastructure adapters, with NestJS controllers as delivery mechanisms and React as a consumer.
- **Security by Design:** deny by default, organization isolation, resource-specific permissions, attributed decisions, transactional audit, no assumed authenticity.

## Bounded contexts

| Context | Main responsibility | Current status |
| --- | --- | --- |
| Identity & Organization | Accounts, membership, accreditation, sessions | Legacy v0.3 implementation; security hardening needed |
| Asset Records | Claims, asset metadata, tenure and inventory | Legacy services; does not prove title |
| Verification & Evidence | Case state machine, submissions, independent decisions, readiness | **v0.4 Clean Architecture vertical slice implemented** |
| Document Custody | Private files, integrity, access control, future retention | Existing storage adapter; case privacy tightened |
| Disputes | Conflicting claims and blocking decisions | Existing database workflow; domain extraction pending |
| Audit & Provenance | Attributable append-only events and future anchors | Existing local chain; external anchor unavailable |
| Commerce & Billing | Quotations, subscriptions, entitlements and settlement | Quote/catalog only; payment integrations unavailable |
| Integration Control Plane | Official data, GIS, identity, verification partners | Adapters are placeholders; government authorization required |

## Implemented dependency diagram

```text
React Case Detail UI
  GET /api/v1/cases/:id/readiness
  POST /api/v1/cases/:id/evidence/:evidenceId/review
  POST /api/v1/cases/:id/advance
               |
      NestJS CasesController
               |
      CasesService (HTTP orchestration and access checks)
               |
      EvidenceWorkflow [APPLICATION USE CASE]
               |                       |
      Pure EvidencePolicy [DOMAIN]    WorkflowRepository [PORT]
                                       ^
                                       |
                           PostgresWorkflowRepository [ADAPTER]
                                 |             |
                             Database       AuditService
```

Paths:

```text
apps/api/src/contexts/verification/
  domain/evidence-policy.ts
  application/evidence-workflow.ts
  infrastructure/postgres-workflow.repository.ts
```

Domain and application code do not import NestJS, Express, PostgreSQL, React or any other delivery framework. The repository port allows isolated unit tests with a fake in-memory adapter. NestJS wires the real PostgreSQL adapter through dependency injection. The existing controllers keep their URLs for compatibility with the v0.3 React client.

## Explicit invariants enforced

1. A closed or blocked case cannot advance.
2. Only the current stage's required evidence type can unlock advancement.
3. Submitted or rejected evidence never counts as accepted evidence.
4. Evidence must be accepted by a separate authenticated, authorized reviewer.
5. A reviewer cannot decide on their own submitted evidence.
6. An unresolved dispute blocks review and advancement.
7. The current stage must pass professional-role rules when applicable.
8. Final-stage advancement is reserved for a professionally approved organizational administrator.
9. Cases are isolated by organization and restricted to creator, assignee or organization admin.
10. General asset-sharing grants do **not** automatically grant access to internal case notes or case-linked documents.
11. Case advancement and its audit event are written inside one transaction.
12. Completion marks the **internal review** as complete; it does not assert legal ownership or official registry verification.

## SOLID implementation evidence

**S:** `EvidencePolicy` holds business rules only; `EvidenceWorkflow` coordinates use cases; `PostgresWorkflowRepository` owns SQL.  
**O:** implement `WorkflowRepository` with a new adapter without editing the use-case class.  
**L:** in-memory fake and PostgreSQL implementations satisfy the same port contract.  
**I:** `WorkflowTransaction` exposes only the small set of operations needed by evidence decisions and stage transitions.  
**D:** application use cases depend on the `WorkflowRepository` interface; NestJS resolves the actual adapter at composition time.

## TDD evidence and repeatable commands

The initial **RED** test execution failed because the new use case and domain policy files were not yet implemented; the `tools/tests-v04/workflow.test.cjs` test suite was written before the implementation. After adding the pure domain and application code, the same suite reached **GREEN (12/12 passed)**. Additional architecture contract checks reached **3/3 passed**. The source underwent a refactor into separate application/domain and PostgreSQL adapters while retaining those passes. This is *source-level TDD evidence*, not a claim that live database integration tests ran.

```bash
npm run smoke:offline
npm run verify:v03
npm run verify:v04
npm test
npm run build
```

The first three can run without PostgreSQL. Normal `npm test` and `npm run build` require dependencies. Full CI additionally applies migrations and runs a local HTTP/PostgreSQL integration smoke test.

## Security-specific changes from v0.3

- A read grant for a property no longer implies permission to inspect every case on that property.
- Case listing, dashboard recent cases, and document counts apply the **same** case-participant boundary.
- Submitted evidence is not confused with an official registry response.
- A deterministic readiness API explains blockers, allowing React to prevent invalid advancement actions before submission. The API rechecks all conditions transactionally; disabling a UI button is never treated as authorization.
- Decisions, timestamps, actor identity and state changes remain auditable.
- The PostgreSQL adapter locks case and evidence rows to make review and stage-change decisions resistant to concurrent double-submission.

## Remaining architecture debt

This is a **vertical-slice refactor**, not a claim that the whole v0.3 codebase has already been migrated to complete Clean Architecture. Assets, identity, documents, disputes, quotations, and notification controllers still contain application/domain logic and must be extracted into their own contexts. There is no event/outbox model, distributed transaction coordinator, tenant-level row-level security (RLS), independent signature service, or external ledger anchor yet. More comprehensive security tests, threat-model review, file malware scanning, MFA, HttpOnly sessions, encrypted object storage, penetration testing, and approved integrations remain mandatory before production.
