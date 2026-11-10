# AssetTrust v0.6 Architecture — DDD, TDD, SOLID, Clean Architecture, Security by Design

Compiled by: **Aturinzire Hargreave**  
Version: **0.6.0**

## Bounded context

The Professional Trust context is distinct from Identity & Sessions, Land & Asset Registry, Verification Cases, Evidence, Documents, Audit and Commerce. Authenticating a user is not the same as establishing a professional qualification. The system therefore separates `users.role` (a job responsibility) from independently attested `professional_accreditations` (time-bound verification evidence).

```
React Professional Trust Page
             |
      NestJS route controller (transport, AuthGuard, throttle)
             |
 ProfessionalTrustService (authorization + input validation)
             |
 ReviewProfessionalApplication (application use case)
             |
 Trust Policy (pure domain)
             ^
             |
 TrustRepository interface <— PgTrustRepository (PostgreSQL transaction)
                               |
                Credential applications / reviewers / decisions
                               |
                    AuditService (organization hash chain)
```

### Domain

`apps/api/src/contexts/professional-trust/domain/trust-policy.ts`: role-specific claims, independently reviewed status, expiry and revocation, dual distinct attestors, exclusion of applicant's organization, MFA/appointment eligibility. No NestJS/SQL imports.

### Application

`application/trust-usecases.ts`: `ReviewProfessionalApplication` orchestrates validation and decisions using `TrustRepository` and `TrustTransaction` ports, with injected clock. It never performs SQL or framework work.

### Infrastructure

`infrastructure/pg-trust.repository.ts`: PostgreSQL row locks on the application and reviewer/session status, unique per-application attestation constraint, atomic decision/final accreditation update and audit event. Separate retry logic for transient errors should be added before production.

### Presentation

`apps/web/src/ProfessionalTrustPage.tsx`: mobile/desktop UI, applications, independent reviewer queue, recent MFA code input, evidence review rationale. No browser storage of bearer tokens. The page shows clear manual/preview disclaimers.

## Security policy and acceptance criteria

**SEC-06-01:** Organization admins cannot self-upgrade to SURVEYOR or LEGAL_REVIEWER.  
**SEC-06-02:** Applicants can submit only claims for their pre-existing invited professional role.  
**SEC-06-03:** Two distinct, active, appointed reviewers must record verified checks.  
**SEC-06-04:** A rejected attestation closes the application and prevents approval.  
**SEC-06-05:** Reviewers cannot be applicants or belong to the applicant organization.  
**SEC-06-06:** Appointed reviewers must have current TOTP MFA and must repeat MFA within the same session within 15 minutes of sensitive operations.  
**SEC-06-07:** Every qualification check includes method, external reference and sufficient notes.  
**SEC-06-08:** Runtime professional privileges require matching role, future expiry and absence of revocation.  
**SEC-06-09:** Revocation is immediate for subsequent access-token authorization requests, independently of previously issued JWT claims.  
**SEC-06-10:** Reviewer appointments cannot be created by ordinary HTTP endpoints.  
**SEC-06-11:** No public claim that evidence has been authenticated by a government body or that verified case evidence proves legal ownership.  
**SEC-06-12:** Applicant metadata and submitted documents stay outside arbitrary organization sharing and cross-tenant document access.

## SOLID mapping

- Single Responsibility: professional policies, use case, PostgreSQL adapter and HTTP transport have separate files and responsibilities.
- Open/Closed: additional credential types should be introduced through explicit policy extensions and adapters, not implicit administrator override.
- Liskov Substitution: in-memory TrustRepository substitutes for PostgreSQL in application tests; acceptance semantics remain the same.
- Interface Segregation: the transactional port exposes only application, reviewer, attestation, finalization and audit operations needed by the use case.
- Dependency Inversion: application code depends on ports, not PostgreSQL.

## Concurrency / threat boundaries

The application row is locked before collecting attestations. The second attestor's transaction cannot finalize concurrently from a stale state. A unique `(application_id, reviewer_id)` constraint prevents double votes at database level. The adapter locks active appointment, MFA credential and session rows to reject withdrawn privileges and stale authenticator validation. Professional claims and decisions are auditable but not independently notarized. The operator CLI still relies on protection of DB credentials and approved change procedures.

## Design limitations

This is NOT a complete DDD refactor of the older modules. Several original services remain organized as NestJS service files and need extraction into independently tested application/domain layers. The existing source-based preview renderer is not the React browser runtime; production builds and real API integration are separate release gates.
