# AssetTrust v0.2 — verified vs unverified implementation status

**Compiled for Aturinzire Hargreave.**

## Source components

- **React + TypeScript + Vite** responsive app: authentication, dashboard, assets, asset detail, verification case listing, case detail, private documents, evidence reports, billing catalogue, audit, notifications, case assignment, team, task board, disputes, monitoring, quotes, access grants, integrations, settings.
- **NestJS + PostgreSQL** modules: identity and team invitations, tenancy/access grants, assets, cases, evidence workflow, private upload/download, audit, in-app notifications, disputes, tasks, reminders, draft quotes, explicit provider status, locally computed integrity commitment and non-official evidence summary.
- **Database:** additive `002_operations.sql` migration plus existing base schema. Existing developer DBs can migrate with the same migration command.
- **Security measures present:** Argon2id hashes; invite expiry and hashed token storage; basic throttling; role/stage checks; multi-tenant query conditions; selective record-level access; file MIME magic bytes; SHA-256 digest; audit hash chain; blocked-case gate.
- **Screenshots:** offline source-derived desktop/mobile previews of all 20 views (19 authenticated plus authentication). They use fake UI records, not a running backend.

## Checks performed in this build environment

- TypeScript/TSX source transpilation **syntax** check.
- Offline tests of stage ordering, professional gates, invitation expiry, due-date parsing, and SHA-based local commitment identities.
- Responsive HTML produced from actual TSX trees via an offline preview renderer. This renderer does not test actual browser React event handling.
- Chromium screenshots at 1440x900 desktop and 390x844 mobile, with visual inspection of selected pages.

## Checks NOT performed

- A clean `npm install`, real `tsc` typecheck / Vite production bundle, live NestJS startup, PostgreSQL migrations or integration/E2E tests: npm registry and database services were unavailable to this environment.
- Security/penetration testing, load testing, official government/registrar partnership, trained operator workflow, document scanning, actual payment processing, external blockchain anchoring or public release.

## High-priority issues and readiness blockers

| Priority | Requirement | Blocker |
|---|---|---|
| P0 | Run fresh dependencies and real NestJS + React builds | Needs connected developer machine or CI |
| P0 | Run migrations and transactional database integration tests | Needs PostgreSQL |
| P0 | Full per-action record authorization, least-privilege tenancy tests | Security audit incomplete |
| P0 | Safe identity/documents storage and access logging | Prototype local storage only |
| P0 | HttpOnly sessions and MFA | Bearer tokens in sessionStorage are not production hardened |
| P0 | Independent professional verification and dual control | No in-app accreditation process |
| P0 | Data protection and land-law counsel review | External approval required |
| P1 | Object storage encryption and malware scan pipeline | Not implemented |
| P1 | Audit anchoring adapter with independently verified receipts | Local hash only |
| P1 | Official registry integration by written authorization | Not connected |
| P1 | Quotes → invoices → financial ledger/payments/reconciliation | Quotes only |
| P1 | Verified report signatures and privacy-safe QR validation | Not implemented |
| P1 | Scheduled email/SMS delivery and reminder workers | In-app notices and stored reminders only |
| P1 | Self-hosted maps and authoritative survey geometry | UI concept only |
| P2 | Offline field inspection app and sync | Not implemented |
| P2 | Expansion to machinery, cooperative, vehicle registries with distinct rules | Basic asset types only |

## Accurate marketing language for this stage

“AssetTrust v0.2 is a developer prototype for organizing land and asset due-diligence evidence. It supports tenant-scoped case management, human-source records, local audit fingerprints and a responsive web interface. It does not provide official registry authentication, guarantee title, process payments or produce government certificates.”
