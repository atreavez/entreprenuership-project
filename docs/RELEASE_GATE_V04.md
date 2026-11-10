# AssetTrust v0.4 — Engineering checkpoint & release gate

**Compiled by Aturinzire Hargreave** | 6 November 2026

## Included

- DDD bounded-context inventory and a real Clean Architecture verification vertical slice.
- Framework-free evidence-review domain policies, testable application use cases, repository port, PostgreSQL adapter and NestJS dependency injection.
- `GET /api/v1/cases/:id/readiness` with required evidence and missing-condition reasons.
- Source-based desktop/mobile React readiness UI, and updated visual previews.
- Confidential case access and metadata-listing restrictions applied across API endpoints.
- Additional repeatable unit, architecture, and future live integration checks.

## Verified locally in the authoring environment

| Check | Outcome |
| --- | --- |
| Pure domain/application TypeScript compilation (`tsc`) | PASS |
| v0.4 use-case tests (`node --test`) | **12/12 PASS** |
| Architecture/security source-contract tests | **3/3 PASS** |
| v0.3 offline evidence governance checks | **17/17 PASS** |
| Existing offline helper checks | PASS |
| TypeScript/TSX syntax parse | PASS, 28 files |
| React source-derived case-page render | PASS |
| 1440px desktop and 390px mobile overflow check | PASS, no horizontal overflow |
| 390px mobile readiness panel and disabled advancement button | PASS |

## Not verified, and not to be reported as passed

- Actual NestJS boot and TypeScript typechecking of full app with downloaded dependencies.
- Running the PostgreSQL migrations and live SQL queries.
- Full React/Vite production build and interactive UI test in real React.
- Full cross-tenant and permission HTTP end-to-end suite against real PostgreSQL.
- External registry searches, payment settlement, blockchain anchoring, geographic boundary accuracy, and legally valid professional certification.
- Production-grade encrypted and scanned file storage, MFA, CSRF/session design, recovery controls and infrastructure security assessment.

## Release decision

**NOT READY FOR PUBLIC OR SENSITIVE-DATA PRODUCTION DEPLOYMENT.** It is suitable as a source checkpoint for further engineering, offline verification, and a controlled fictional-data local test environment. Treat all UI records as mock values and all report summaries as non-government documents.

## Local validation steps

1. Run `npm install` with approved packages and retain `package-lock.json` for reproducibility.
2. Run `npm run smoke:offline && npm run verify:v03 && npm run verify:v04`.
3. Run `npm test && npm run build` and resolve type errors.
4. Start a disposable PostgreSQL instance, run migrations 001–003, and start the API.
5. With fictional data only, run `ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:e2e:local`.
6. Review access to case records, evidence, document bytes, dashboards, and reports across roles and tenant boundaries.
7. Require independent legal and information-security review before exposing real owner documents.
