# AssetTrust v0.35 — Report Withdrawal Architecture

## Problem and trust boundary
An AssetTrust issued report is a private, scoped evidence review, not a government title. A post-issuance dispute or finding may make its findings unreliable. Correct handling requires a transparent, immediate-enough status change without overwriting the original report. v0.34 handled `SUPERSEDED` and `UNDER_REVIEW`, but did not include a governed final withdrawal action.

## Entities
- `report_withdrawal_proposals`: organization-owned, report-scoped, author, confidential reason, immutable proposal identity and at most one pending decision. State moves from `PENDING` to `APPROVED` or `REJECTED` exactly once.
- `issued_report_withdrawals`: append-only independent approval fact, one per report. The existing `issued_verification_reports` row remains unchanged. Relational composite foreign keys enforce tenant matching.

## Application use cases and data flow
1. A current **organization administrator** with active MFA and a fresh session step-up requests withdrawal of one of the organization's issued reports and supplies a plain-text reason (20–1000 characters). The reason is never publicly exposed.
2. A second current organization administrator, who is not the proposer, independently reviews the internal reason with fresh MFA; the original proposer must still be active and authorized.
3. A rejection permanently closes that proposal without withdrawing the report. An approval transaction inserts an append-only withdrawal fact and writes an audit event. No status mutation of the issued snapshot occurs.
4. Public `GET /api/v1/reports/verify/:id` computes the original snapshot SHA-256 as in v0.34, flags a pending withdrawal as `UNDER_REVIEW`, then responds with `WITHDRAWN` following approval, a non-official notice and no confidential reason. An integrity failure takes precedence over a withdrawal. Public responses use `Cache-Control: no-store`.

## Endpoints
| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/reports/issued` | Current organization administrator and MFA; includes private proposals and withdrawals |
| POST | `/api/v1/reports/issued/withdrawals` | Current organization administrator with fresh MFA; body `reportId`, `reason` |
| POST | `/api/v1/reports/issued/withdrawals/:id/decision` | Different current organization administrator with fresh MFA; body `decision: APPROVE or REJECT` |
| GET | `/api/v1/reports/verify/:id` | Anonymous, metadata only, no-store |

## Fixed safeguards vs editable configuration
Administrative UI manages *individual authorized decisions* but may not disable legal notices, cross-tenant isolation, permanent auditability, evidence preservation or dual approval. Those are safety invariants. They cannot be changed by ordinary tenant configuration. Any future global control-plane policy evolution requires separately reviewed migration and security tests.

## Outstanding deployment and security gates
- Run the real npm lockfile install, API/React build, all tests and live PostgreSQL migration checks on a connected Kali machine or CI.
- Execute database contract tests and authenticated two-administrator/tenant/browser flows against disposable PostGIS. Unit and synthetic query mocks are not substitutes.
- Add recipient notices, independently archived status attestations, signed document exports, offline QR validation, encrypted backups and operational incident playbooks before handling genuine sensitive client reports.
- Evaluate formal legal and professional review/retention obligations in Uganda. No claim is made that a signed PDF, government data feed, blockchain anchor, or regulator approval exists.
