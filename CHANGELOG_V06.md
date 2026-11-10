# AssetTrust v0.6 — Professional Trust and Authorization

**Date:** 7 November 2026  
**Prepared for:** Aturinzire Hargreave

## Implemented changes

- Introduced `professional-trust` DDD bounded context with framework-independent domain rules, repository-port application use case, PostgreSQL transaction adapter, and NestJS transport controller.
- Added migration `005_professional_trust.sql`: platform reviewer appointments, professional applications, independent decisions, active/revoked/expired professional accreditation, and session-level MFA step-up timestamps.
- Added private professional application submission, personal application status/history, withdrawal, platform reviewer queue, independent attestation, and emergency revocation endpoints.
- Requires **two different trusted reviewers** from outside the applicant's organization to independently record an affirmative external check; one rejection closes the claim.
- Requires each appointed platform reviewer to have MFA enabled, plus a **recent (15 minutes) code validation in that exact session** for review and revocation operations.
- Professional approval is now calculated dynamically from the role-specific accreditation record and its expiry/revocation state. A legacy users table flag is not the source of authorization.
- Removed the ability for a general organization administrator to act as a surveyor or legal reviewer because of a generic approval flag. Final admin workflow requires independent legal professional acceptance.
- Added a responsive React professional trust interface with applicant and trusted reviewer modes, MFA step-up, and safe preview fixtures.
- Added CLI-only operator appointment/disable procedure; no self-service API exists to grant platform trust roles.
- Added 20 focused domain, application and architecture/security tests; adapted earlier security tests to enforce the stricter review and role definitions.

## Not implemented / release blockers

- Official real-time verification against Ugandan professional licensing authorities, or proof that the checks submitted by human reviewers were actually conducted.
- Dedicated encrypted credential-document submission, professional licence source API, sanctions checks, or regulator partnership.
- Production email verification, account recovery, immutable external notarization, working payments, real registry integration, comprehensive monitoring and independent penetration testing.
- The full npm production build, PostgreSQL migration execution, HTTP integration tests and user acceptance testing have **not** been completed in this environment.

## Important disclaimer

AssetTrust can record professional identity and claims, as well as the outcome of documented independent checks. It cannot itself issue professional licences or government land titles. A blockchain hash, verified application status, or private due-diligence report must never be presented as legal proof of ownership.
