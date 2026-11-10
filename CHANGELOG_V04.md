# AssetTrust v0.4 change log

**Compiled by Aturinzire Hargreave — 6 November 2026**

1. Migrated the evidence review + case advancement workflow into a framework-independent DDD domain, application use case, repository port and NestJS/PostgreSQL adapter.
2. Added `GET /cases/:id/readiness` and a responsive stage-readiness React panel that shows blockers and prevents premature advancement.
3. Tightened case participant access and case-linked document metadata visibility across case listing, dashboard and document-vault routes.
4. Preserved audit-in-transaction behavior, two-person review policy, dispute blocks, professional approval requirements and non-official report language.
5. Added 12 new domain/application tests, 3 architecture/security checks and extended the local HTTP integration smoke test.
6. Preserved existing v0.3 features and supplied desktop/mobile source-based evidence-review renders.
7. Listed known remaining Clean Architecture work and production security release blockers explicitly.
